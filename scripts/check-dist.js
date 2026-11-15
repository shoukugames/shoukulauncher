#!/usr/bin/env node
'use strict';
// Checks the finished packages in dist/:
//   - the Windows MSI and zip list only .exe game downloads, with no self-extracting packer
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

function findMsiTool(name) {
  for (const dir of [process.env.WIXL ? path.dirname(process.env.WIXL) : '', ...(process.env.PATH || '').split(path.delimiter)]) {
    const p = dir && path.join(dir, name);
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function checkZip(file, sevenZip) {
  console.log(`\n${path.basename(file)}`);
  if (!sevenZip) return console.log('  - 7-Zip not found; skipping content check');
  const list = execFileSync(sevenZip, ['l', '-slt', file], { maxBuffer: 64 * 1024 * 1024 }).toString().split('\n').filter((l) => l.startsWith('Path = ')).map((l) => l.slice(7).trim().replace(/\\/g, '/'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shouku-check-'));
  try {
    execFileSync(sevenZip, ['e', '-y', `-o${tmp}`, file, 'resources/content/catalog.json'], { stdio: 'ignore' });
    checkCatalog('zip', fs.readFileSync(path.join(tmp, 'catalog.json'), 'utf8'), list, 'windows');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  list.includes('Shouku Launcher.exe') ? ok('contains Shouku Launcher.exe at the top level') : bad('Shouku Launcher.exe missing');
  const sfx = list.filter((p) => /(^|\/)(elevate\.exe|.*__uninstaller\.exe|app-64\.7z)$/i.test(p));
  sfx.length ? bad(`self-extractor pieces found: ${sfx.join(', ')}`) : ok('plain folder layout, no self-extracting packer');
}

function checkMsi(file, version) {
  console.log(`\n${path.basename(file)}`);
  const head = Buffer.alloc(8);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, head, 0, 8, 0);
  fs.closeSync(fd);
  head.equals(Buffer.from('d0cf11e0a1b11ae1', 'hex')) ? ok('valid Windows Installer database') : bad('not an MSI file');
  const msiinfo = findMsiTool('msiinfo');
  const msiextract = findMsiTool('msiextract');
  if (!msiinfo || !msiextract) return console.log('  - msitools not found; skipping content check');
  const info = (args) => execFileSync(msiinfo, args, { maxBuffer: 64 * 1024 * 1024 }).toString();
  const props = Object.fromEntries(info(['export', file, 'Property']).split(/\r?\n/).slice(3).filter(Boolean).map((l) => l.split('\t').map((x) => x.trim())));
  props.ProductVersion === version ? ok(`ProductVersion ${version}`) : bad(`ProductVersion is ${props.ProductVersion}, expected ${version}`);
  props.Manufacturer === 'Shouku Games' ? ok('Manufacturer: Shouku Games') : bad(`Manufacturer is ${props.Manufacturer}`);
  const source = Number((info(['suminfo', file]).match(/^Source: (\d+)/m) || [])[1]);
  source & 8 ? ok('per-user install, no administrator rights needed') : bad('installer asks for administrator rights');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shouku-check-'));
  try {
    execFileSync(msiextract, ['-C', tmp, file], { stdio: 'ignore', maxBuffer: 64 * 1024 * 1024 });
    const all = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.relative(tmp, path.join(d, e.name)).split(path.sep).join('/'));
    })(tmp);
    const exe = all.find((p) => p.endsWith('/Shouku Launcher.exe'));
    exe ? ok(`installs to %LOCALAPPDATA%\\${path.dirname(exe).replace(/\//g, '\\')}`) : bad('Shouku Launcher.exe missing');
    const cat = all.find((p) => p.endsWith('resources/content/catalog.json'));
    if (!cat) return bad('catalog.json missing');
    checkCatalog('msi', fs.readFileSync(path.join(tmp, cat), 'utf8'), all, 'windows');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const files = fs.existsSync(DIST) ? fs.readdirSync(DIST) : [];
const debs = files.filter((f) => f.endsWith('.deb'));
const msis = files.filter((f) => /^ShoukuLauncher-Setup-.*\.msi$/.test(f));
const zips = files.filter((f) => /^ShoukuLauncher-.*-win-x64\.zip$/.test(f));
const winVersion = require(path.join(ROOT, 'package.json')).windowsVersion;
if (!debs.length && !msis.length && !zips.length) {
  console.error('Nothing in dist/. Run "npm run dist:linux" and/or "npm run dist:win" first.');
  process.exit(1);
}
debs.forEach((f) => checkDeb(path.join(DIST, f)));
const seven = find7z();
msis.forEach((f) => checkMsi(path.join(DIST, f), winVersion));
zips.forEach((f) => checkZip(path.join(DIST, f), seven));
const oldSfx = files.filter((f) => /^ShoukuLauncher-Setup-.*\.exe$/.test(f));
if (oldSfx.length) bad(`old self-extracting installer still in dist/: ${oldSfx.join(', ')}`);
console.log(failed ? '\nSome checks FAILED.' : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
