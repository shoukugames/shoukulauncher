'use strict';
// Installs, launches and removes games.
//   Windows: downloads the game's .exe. Portable builds are kept in the library folder and run
//            directly; NSIS installers are run silently into the library folder.
//   Linux:   downloads the game's .deb and installs it with apt (through pkexec), then
//            launches the command from the package's .desktop file.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn, execFile } = require('child_process');
const { EventEmitter } = require('events');
const log = require('./logger');

const IS_WIN = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';
const PLATFORM = IS_WIN ? 'windows' : 'linux';
const ALLOWED_HOST = 'shoukugames.org';
const UA = 'ShoukuLauncher/1.0 (+https://shoukugames.org/)';

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, error: err, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

/** Splits a .desktop Exec line into argv, dropping field codes such as %U. */
function parseExec(line) {
  const argv = [];
  let cur = '';
  let q = false;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && q && i + 1 < line.length) {
      cur += line[++i];
    } else if (c === '"') {
      q = !q;
      has = true;
    } else if (c === ' ' && !q) {
      if (has || cur) argv.push(cur);
      cur = '';
      has = false;
    } else cur += c;
  }
  if (has || cur) argv.push(cur);
  return argv.filter((a) => !/^%[a-zA-Z]$/.test(a)).map((a) => a.replace(/%%/g, '%'));
}

class Library extends EventEmitter {
  constructor({ dataDir, gamesDir }) {
    super();
    this.dataDir = dataDir;
    this.gamesDir = gamesDir;
    this.downloadsDir = path.join(dataDir, 'downloads');
    this.stateFile = path.join(dataDir, 'library.json');
    this.catalog = new Map();
    this.jobs = new Map(); // slug -> {phase, received, total, speed, error, cancel}
    this.queue = [];
    this.running = new Map(); // slug -> {child, started}
    this.busy = false;
    fs.mkdirSync(this.downloadsDir, { recursive: true });
    fs.mkdirSync(this.gamesDir, { recursive: true });
    this.state = this.load();
  }

  load() {
    try {
      const s = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      return { games: s.games || {}, settings: s.settings || {} };
    } catch {
      return { games: {}, settings: {} };
    }
  }

  save() {
    const tmp = this.stateFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.stateFile);
  }

  setCatalog(games) {
    this.catalog = new Map(games.map((g) => [g.slug, g]));
  }

  entry(slug) {
    if (!this.state.games[slug]) this.state.games[slug] = { playSeconds: 0 };
    return this.state.games[slug];
  }

  /** Snapshot for the renderer. */
  snapshot() {
    const games = {};
    for (const [slug, e] of Object.entries(this.state.games)) {
      games[slug] = { ...e, running: this.running.has(slug) };
    }
    for (const slug of this.running.keys()) if (!games[slug]) games[slug] = { running: true };
    const jobs = {};
    for (const [slug, j] of this.jobs) jobs[slug] = { phase: j.phase, received: j.received, total: j.total, speed: j.speed, error: j.error, message: j.message };
    return { platform: PLATFORM, games, jobs, queue: [...this.queue], settings: this.state.settings };
  }

  changed() {
    this.emit('changed', this.snapshot());
  }

  // ---------------------------------------------------------------- detection

  /** Linux: notices games that were installed (or removed) outside the launcher. */
  async detect() {
    if (!IS_LINUX) return;
    for (const g of this.catalog.values()) {
      const pkg = g.download && g.download.package;
      if (!pkg) continue;
      const r = await run('dpkg-query', ['-W', '-f=${Status}\t${Version}', pkg]);
      const installed = r.code === 0 && /install ok installed/.test(r.stdout);
      const e = this.state.games[g.slug];
      if (installed) {
        const version = r.stdout.split('\t')[1] || null;
        const ent = this.entry(g.slug);
        if (!ent.installed) ent.installedAt = ent.installedAt || new Date().toISOString();
        Object.assign(ent, { installed: true, package: pkg, version: (version || '').replace(/-.*$/, '') || ent.version });
        if (!ent.exec) ent.exec = await this.findLinuxExec(pkg);
      } else if (e && e.installed) {
        e.installed = false;
        delete e.exec;
      }
    }
    this.save();
    this.changed();
  }

  // ---------------------------------------------------------------- queue

  install(slug) {
    const g = this.catalog.get(slug);
    if (!g) throw new Error('Unknown game');
    if (this.jobs.has(slug)) return;
    this.checkDownload(g.download);
    this.jobs.set(slug, { phase: 'queued', received: 0, total: g.download.size || 0, speed: 0 });
    this.queue.push(slug);
    this.changed();
    this.pump();
  }

  cancel(slug) {
    const j = this.jobs.get(slug);
    if (!j) return;
    if (j.phase === 'queued') {
      this.queue = this.queue.filter((s) => s !== slug);
      this.jobs.delete(slug);
    } else if (j.phase === 'downloading' && j.cancel) {
      j.cancel();
    } else if (j.phase === 'error') {
      this.jobs.delete(slug);
    }
    this.changed();
  }

  async pump() {
    if (this.busy) return;
    const slug = this.queue.shift();
    if (!slug) return;
    this.busy = true;
    const job = this.jobs.get(slug);
    const g = this.catalog.get(slug);
    try {
      const file = await this.download(g, job);
      job.phase = 'installing';
      job.message = IS_LINUX ? 'Waiting for your password…' : 'Installing…';
      this.changed();
      if (IS_WIN) await this.installWindows(g, file);
      else if (IS_LINUX) await this.installLinux(g, file, job);
      else throw new Error('This platform is not supported.');
      this.jobs.delete(slug);
      log.info(`Installed ${slug} ${g.version}`);
      this.emit('notice', { type: 'installed', slug, title: g.title });
    } catch (err) {
      if (err.cancelled) {
        this.jobs.delete(slug);
        log.info(`Cancelled ${slug}`);
      } else {
        log.error(`Install of ${slug} failed:`, err);
        job.phase = 'error';
        job.error = err.message;
      }
    } finally {
      this.busy = false;
      this.save();
      this.changed();
      this.pump();
    }
  }

  checkDownload(dl) {
    if (!dl || !dl.url) throw new Error('No download for this platform.');
    const u = new URL(dl.url);
    if (u.protocol !== 'https:' || (u.hostname !== ALLOWED_HOST && !u.hostname.endsWith('.' + ALLOWED_HOST))) {
      throw new Error(`Refusing to download from ${u.hostname}`);
    }
    const want = IS_WIN ? /\.exe$/i : /\.deb$/i;
    if (!want.test(u.pathname) || !want.test(dl.file)) {
      throw new Error(IS_WIN ? 'The Windows launcher only installs .exe games.' : 'The Linux launcher only installs .deb games.');
    }
  }

  download(g, job) {
    const dl = g.download;
    const dest = path.join(this.downloadsDir, path.basename(dl.file));
    const part = dest + '.part';
    job.phase = 'downloading';
    this.changed();
    return new Promise((resolve, reject) => {
      let req;
      let finished = false;
      job.cancel = () => {
        finished = true;
        if (req) req.destroy();
        fs.rm(part, { force: true }, () => {});
        reject(Object.assign(new Error('Cancelled'), { cancelled: true }));
      };
      const get = (url, hops) => {
        this.checkDownload({ url, file: dl.file });
        req = https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 5) {
            res.resume();
            return get(new URL(res.headers.location, url).href, hops + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          }
          job.total = Number(res.headers['content-length']) || dl.size || 0;
          job.received = 0;
          const out = fs.createWriteStream(part);
          let lastT = Date.now();
          let lastB = 0;
          let lastEmit = 0;
          res.on('data', (chunk) => {
            job.received += chunk.length;
            const now = Date.now();
            if (now - lastT >= 1000) {
              job.speed = ((job.received - lastB) * 1000) / (now - lastT);
              lastT = now;
              lastB = job.received;
            }
            if (now - lastEmit > 250) {
              lastEmit = now;
              this.changed();
            }
          });
          res.pipe(out);
          res.on('error', (e) => !finished && reject(e));
          out.on('error', (e) => !finished && reject(e));
          out.on('finish', () => {
            if (finished) return;
            finished = true;
            if (job.total && job.received !== job.total) return reject(new Error('Download was incomplete. Please try again.'));
            fs.renameSync(part, dest);
            resolve(dest);
          });
        });
        req.on('error', (e) => !finished && reject(new Error(`Download failed: ${e.message}`)));
        req.setTimeout(60000, () => req.destroy(new Error('connection timed out')));
      };
      get(dl.url, 0);
    });
  }

  // ---------------------------------------------------------------- Windows

  async installWindows(g, file) {
    const kind = g.download.kind || (/setup/i.test(g.download.file) ? 'nsis' : 'portable');
    const dir = path.join(this.gamesDir, g.slug);
    const e = this.entry(g.slug);
    if (e.installed) await this.removeWindowsFiles(g.slug, e).catch((err) => log.warn('Old version cleanup failed', err));
    fs.mkdirSync(dir, { recursive: true });

    let exe;
    if (kind === 'portable') {
      exe = path.join(dir, path.basename(file));
      fs.renameSync(file, exe);
    } else {
      // NSIS needs /D= unquoted and last; Inno Setup uses /DIR.
      const args = kind === 'inno' ? ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', `/DIR="${dir}"`] : ['/S', `/D=${dir}`];
      const code = await new Promise((resolve, reject) => {
        // Verbatim so /D=<dir> reaches NSIS unquoted; argv0 is quoted so paths with spaces still parse.
        const child = spawn(file, args, { argv0: `"${file}"`, windowsVerbatimArguments: true, windowsHide: false });
        child.on('error', reject);
        child.on('exit', resolve);
      });
      fs.rm(file, { force: true }, () => {});
      if (code !== 0) throw new Error(`The installer stopped with code ${code}.`);
      exe = this.findWindowsExe(dir, g) || this.findWindowsExeElsewhere(g);
    }
    Object.assign(e, { installed: true, kind, version: g.version, dir, exe: exe || null, installedAt: new Date().toISOString() });
    if (!exe) log.warn(`Installed ${g.slug} but could not find its .exe; user can locate it.`);
  }

  findWindowsExe(dir, g) {
    if (!fs.existsSync(dir)) return null;
    const found = [];
    const walk = (d, depth) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory() && depth < 2) walk(p, depth + 1);
        else if (f.isFile() && /\.exe$/i.test(f.name) && !/^(uninst|unins|elevate|crashpad|notification_helper)/i.test(f.name)) found.push(p);
      }
    };
    walk(dir, 0);
    if (!found.length) return null;
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = norm(g.title);
    const slugKey = norm(g.slug);
    return (
      found.find((p) => norm(path.basename(p, '.exe')) === key) ||
      found.find((p) => norm(path.basename(p, '.exe')).includes(slugKey) || key.includes(norm(path.basename(p, '.exe')))) ||
      found.sort((a, b) => path.dirname(a).length - path.dirname(b).length || fs.statSync(b).size - fs.statSync(a).size)[0]
    );
  }

  /** Some installers ignore /D and go to %LOCALAPPDATA%\Programs or Program Files. */
  findWindowsExeElsewhere(g) {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const keys = [norm(g.title), norm(g.slug)];
    const roots = [path.join(process.env.LOCALAPPDATA || '', 'Programs'), process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      for (const d of fs.readdirSync(root)) {
        if (keys.includes(norm(d))) {
          const exe = this.findWindowsExe(path.join(root, d), g);
          if (exe) return exe;
        }
      }
    }
    return null;
  }

  async removeWindowsFiles(slug, e) {
    const dir = e.dir || path.join(this.gamesDir, slug);
    if (e.kind && e.kind !== 'portable' && fs.existsSync(dir)) {
      const un = fs.readdirSync(dir).find((f) => /^(uninstall|unins).*\.exe$/i.test(f));
      if (un) {
        await new Promise((resolve) => {
          const unPath = path.join(dir, un);
          const c = spawn(unPath, ['/S', `_?=${dir}`], { argv0: `"${unPath}"`, windowsVerbatimArguments: true });
          c.on('exit', resolve);
          c.on('error', resolve);
        });
      }
    }
    // Only ever delete inside our own library folder.
    if (path.resolve(dir).startsWith(path.resolve(this.gamesDir) + path.sep)) fs.rmSync(dir, { recursive: true, force: true });
  }

  // ---------------------------------------------------------------- Linux

  async installLinux(g, file, job) {
    const info = await run('dpkg-deb', ['-f', file, 'Package', 'Version']);
    if (info.code !== 0) throw new Error('This file is not a valid .deb package.');
    const pkg = (/^Package:\s*(\S+)/m.exec(info.stdout) || [])[1] || g.download.package;
    let ok = false;
    const pk = await run('pkexec', ['env', 'DEBIAN_FRONTEND=noninteractive', 'apt-get', 'install', '-y', '--allow-downgrades', file]);
    if (pk.code === 0) ok = true;
    else if (pk.error && pk.error.code === 'ENOENT') {
      // No pkexec: hand the .deb to the desktop's software installer and wait for it.
      job.message = 'Finish installing in the Software window…';
      this.changed();
      spawn('xdg-open', [file], { detached: true, stdio: 'ignore' }).unref();
      for (let i = 0; i < 180 && !ok; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const q = await run('dpkg-query', ['-W', '-f=${Status}', pkg]);
        ok = /install ok installed/.test(q.stdout);
      }
      if (!ok) throw new Error('The game was not installed. Try again, or install the .deb manually.');
    } else if (pk.code === 126 || pk.code === 127) {
      throw new Error('Authorisation was cancelled.');
    } else {
      log.error('apt-get output:', pk.stdout.slice(-2000), pk.stderr.slice(-2000));
      throw new Error((pk.stderr.trim().split('\n').pop() || 'apt-get failed').slice(0, 300));
    }
    fs.rm(file, { force: true }, () => {});
    const e = this.entry(g.slug);
    Object.assign(e, { installed: true, package: pkg, version: g.version, exec: await this.findLinuxExec(pkg), installedAt: new Date().toISOString() });
  }

  async findLinuxExec(pkg) {
    const r = await run('dpkg', ['-L', pkg]);
    if (r.code !== 0) return null;
    const files = r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    for (const f of files.filter((x) => /\/applications\/[^/]+\.desktop$/.test(x))) {
      try {
        const txt = fs.readFileSync(f, 'utf8');
        const main = txt.split(/^\[/m).find((s) => s.startsWith('Desktop Entry]')) || txt;
        const m = /^Exec=(.+)$/m.exec(main);
        if (m) return parseExec(m[1].trim());
      } catch {
        /* try next */
      }
    }
    const bin = files.find((x) => /^\/usr\/(games|bin)\/[^/]+$/.test(x));
    return bin ? [bin] : null;
  }

  // ---------------------------------------------------------------- uninstall

  async uninstall(slug) {
    const e = this.state.games[slug];
    if (!e || !e.installed) return;
    if (this.running.has(slug)) throw new Error('Close the game before uninstalling it.');
    this.jobs.set(slug, { phase: 'uninstalling', received: 0, total: 0, speed: 0 });
    this.changed();
    try {
      if (IS_WIN) await this.removeWindowsFiles(slug, e);
      else if (IS_LINUX) {
        const r = await run('pkexec', ['env', 'DEBIAN_FRONTEND=noninteractive', 'apt-get', 'remove', '-y', e.package]);
        if (r.code === 126 || r.code === 127) throw new Error('Authorisation was cancelled.');
        if (r.code !== 0) throw new Error((r.stderr.trim().split('\n').pop() || 'apt-get remove failed').slice(0, 300));
      }
      Object.assign(e, { installed: false, exe: null, exec: null, dir: null });
      log.info(`Uninstalled ${slug}`);
    } finally {
      this.jobs.delete(slug);
      this.save();
      this.changed();
    }
  }

  // ---------------------------------------------------------------- play

  play(slug) {
    const e = this.state.games[slug];
    if (!e || !e.installed) throw new Error('This game is not installed.');
    if (this.running.has(slug)) return;
    let cmd;
    let args = [];
    let cwd;
    if (IS_WIN) {
      if (!e.exe || !fs.existsSync(e.exe)) throw Object.assign(new Error('The game file could not be found.'), { code: 'NO_EXE' });
      cmd = e.exe;
      cwd = path.dirname(e.exe);
    } else {
      if (!e.exec || !e.exec.length) throw Object.assign(new Error('Could not find how to start this game.'), { code: 'NO_EXE' });
      [cmd, ...args] = e.exec;
      cwd = process.env.HOME;
    }
    log.info(`Launching ${slug}: ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, { cwd, detached: !IS_WIN, stdio: 'ignore', windowsHide: false });
    const started = Date.now();
    this.running.set(slug, { child, started });
    e.lastPlayed = new Date().toISOString();
    this.save();
    this.changed();
    const done = (why) => {
      if (!this.running.has(slug)) return;
      this.running.delete(slug);
      const secs = Math.round((Date.now() - started) / 1000);
      e.playSeconds = (e.playSeconds || 0) + secs;
      log.info(`${slug} closed (${why}) after ${secs}s`);
      this.save();
      this.changed();
    };
    child.on('exit', (code) => done(`exit ${code}`));
    child.on('error', (err) => {
      log.error(`Could not start ${slug}:`, err);
      this.emit('notice', { type: 'error', slug, message: `Could not start the game: ${err.message}` });
      done('error');
    });
  }

  stop(slug) {
    const r = this.running.get(slug);
    if (!r) return;
    if (IS_WIN) spawn('taskkill', ['/pid', String(r.child.pid), '/T', '/F'], { windowsHide: true });
    else {
      try {
        process.kill(-r.child.pid, 'SIGTERM');
      } catch {
        r.child.kill('SIGTERM');
      }
    }
  }

  setExe(slug, exe) {
    const e = this.entry(slug);
    if (IS_WIN) {
      if (!/\.exe$/i.test(exe)) throw new Error('Please choose a .exe file.');
      e.exe = exe;
      e.installed = true;
    } else {
      e.exec = [exe];
    }
    this.save();
    this.changed();
  }

  installLocation(slug) {
    const e = this.state.games[slug];
    if (!e) return null;
    if (IS_WIN) return e.exe ? path.dirname(e.exe) : e.dir;
    if (e.exec && e.exec[0] && path.isAbsolute(e.exec[0])) return path.dirname(e.exec[0]);
    return null;
  }
}

module.exports = { Library, PLATFORM, parseExec };
