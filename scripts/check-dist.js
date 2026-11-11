#!/usr/bin/env node
'use strict';
// Checks the finished packages in dist/:
//   - the Windows installer's catalogue lists only .exe downloads
//   - the Debian package's catalogue lists only .deb downloads
//   - every game has screenshots and a 20-second gameplay video bundled
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
let failed = false;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
  failed = true;
  console.log(`  ✗ ${m}`);
};

function find7z() {
  for (const name of ['7z', '7za', '7zz']) {
    try {
      execFileSync(name, ['i'], { stdio: 'ignore' });
      return name;
    } catch {
      /* not on PATH */
    }
  }
  const cache = path.join(os.homedir(), '.cache', 'electron-builder');
  if (!fs.existsSync(cache)) return null;
  for (const d of fs.readdirSync(cache).filter((x) => x.startsWith('7zip'))) {
    for (const sub of fs.readdirSync(path.join(cache, d))) {
      const p = path.join(cache, d, sub, 'bin', '7za');
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function checkCatalog(label, json, files, platform) {
  const want = platform === 'windows' ? '.exe' : '.deb';
  const other = platform === 'windows' ? '.deb' : '.exe';
  const c = JSON.parse(json);
  c.platform === platform ? ok(`catalogue platform is "${platform}"`) : bad(`catalogue platform is "${c.platform}"`);
  c.games.length ? ok(`${c.games.length} games`) : bad('no games');
  const wrong = c.games.filter((g) => !g.download || !g.download.file.toLowerCase().endsWith(want) || !g.download.url.toLowerCase().endsWith(want));
  wrong.length ? bad(`non-${want} downloads: ${wrong.map((g) => g.slug).join(', ')}`) : ok(`every download is a ${want}`);
  json.toLowerCase().includes(other) ? bad(`catalogue mentions ${other}`) : ok(`no ${other} anywhere in the catalogue`);
  const noVideo = c.games.filter((g) => !g.video || !files.some((f) => f.endsWith(`${g.slug}/gameplay.mp4`)));
  noVideo.length ? bad(`missing gameplay video: ${noVideo.map((g) => g.slug).join(', ')}`) : ok('every game has a bundled 20-second gameplay video');
  const noShots = c.games.filter((g) => !g.screenshots.length);
  noShots.length ? bad(`missing screenshots: ${noShots.map((g) => g.slug).join(', ')}`) : ok('every game has screenshots');
  const pkgFiles = files.filter((f) => /\.(exe|deb)$/i.test(f) && /content/.test(f));
  pkgFiles.length ? bad(`game installers bundled inside the package: ${pkgFiles.join(', ')}`) : ok('no game installers are bundled (they download on demand)');
}

function checkDeb(file) {
  console.log(`\n${path.basename(file)}`);
  const list = execFileSync('dpkg-deb', ['-c', file], { maxBuffer: 64 * 1024 * 1024 }).toString().split('\n');
  const catPath = list.map((l) => l.split(/\s+/).slice(5).join(' ')).find((p) => p.endsWith('resources/content/catalog.json'));
  if (!catPath) return bad('catalog.json not found in the .deb');
  const json = execFileSync('sh', ['-c', `dpkg-deb --fsys-tarfile "$1" | tar -xO "$2"`, 'sh', file, catPath], { maxBuffer: 64 * 1024 * 1024 }).toString();
  checkCatalog('deb', json, list, 'linux');
  const info = execFileSync('dpkg-deb', ['-f', file, 'Package', 'Version', 'Architecture']).toString().replace(/\n/g, ' ');
  ok(info.trim());
}

function checkExe(file, sevenZip) {
  console.log(`\n${path.basename(file)}`);
  const head = Buffer.alloc(2);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, head, 0, 2, 0);
  fs.closeSync(fd);
  head.toString() === 'MZ' ? ok('valid Windows executable (MZ header)') : bad('not a Windows executable');
  if (!sevenZip) return console.log('  - 7-Zip not found; skipping content check');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shouku-check-'));
  try {
    execFileSync(sevenZip, ['x', '-y', `-o${tmp}`, file, '$PLUGINSDIR/app-64.7z'], { stdio: 'ignore' });
    const app7z = path.join(tmp, '$PLUGINSDIR', 'app-64.7z');
    if (!fs.existsSync(app7z)) return bad('app-64.7z not found inside the installer');
    const paths = (archive) =>
      execFileSync(sevenZip, ['l', '-slt', archive], { maxBuffer: 64 * 1024 * 1024 }).toString().split('\n').filter((l) => l.startsWith('Path = ')).map((l) => l.slice(7).trim().replace(/\\/g, '/'));
    // electron-builder stores already-compressed files (.mp4 …) directly in the installer, outside app-64.7z.
    const list = [...paths(app7z), ...paths(file)];
    execFileSync(sevenZip, ['e', '-y', `-o${tmp}`, app7z, 'resources/content/catalog.json'], { stdio: 'ignore' });
    checkCatalog('exe', fs.readFileSync(path.join(tmp, 'catalog.json'), 'utf8'), list, 'windows');
    list.some((p) => /Shouku Launcher\.exe$/.test(p)) ? ok('contains Shouku Launcher.exe') : bad('Shouku Launcher.exe missing');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const files = fs.existsSync(DIST) ? fs.readdirSync(DIST) : [];
const debs = files.filter((f) => f.endsWith('.deb'));
const exes = files.filter((f) => /^ShoukuLauncher-Setup-.*\.exe$/.test(f));
if (!debs.length && !exes.length) {
  console.error('Nothing in dist/. Run "npm run dist:linux" and/or "npm run dist:win" first.');
  process.exit(1);
}
debs.forEach((f) => checkDeb(path.join(DIST, f)));
const seven = find7z();
exes.forEach((f) => checkExe(path.join(DIST, f), seven));
console.log(failed ? '\nSome checks FAILED.' : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
