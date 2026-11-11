#!/usr/bin/env node
'use strict';
// Builds the Windows installer (NSIS .exe).
//
// On Windows this simply runs electron-builder. On Linux, electron-builder normally needs Wine
// for one step: running the intermediate installer to extract the uninstaller. Instead we put a
// tiny "wine" shim on PATH that does that extraction with electron-builder's own pure-JS
// UninstallerReader (the same code it uses on macOS where Wine cannot run), so no Wine is needed.
// Set USE_REAL_WINE=1 to use a real Wine installation instead.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const builder = path.join(ROOT, 'node_modules', 'electron-builder', 'cli.js');
const env = { ...process.env };

if (process.platform !== 'win32' && !process.env.USE_REAL_WINE) {
  const shimDir = path.join(ROOT, 'build', 'wine-shim');
  fs.mkdirSync(shimDir, { recursive: true });
  const nsisUtil = require.resolve('app-builder-lib/out/targets/nsis/nsisUtil', { paths: [ROOT] });
  const shim = path.join(shimDir, 'wine');
  fs.writeFileSync(
    shim,
    `#!${process.execPath}
'use strict';
const path = require('path');
const { UninstallerReader } = require(${JSON.stringify(nsisUtil)});
const installer = process.argv[2];
if (!installer || !installer.toLowerCase().endsWith('.exe')) { console.error('wine-shim: unsupported call', process.argv.slice(2)); process.exit(1); }
// Same name electron-builder expects: <installer without "exe">__uninstaller.exe
const out = path.join(path.dirname(installer), path.basename(installer, 'exe') + '__uninstaller.exe');
UninstallerReader.exec(installer, out).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
`,
  );
  fs.chmodSync(shim, 0o755);
  env.PATH = `${shimDir}${path.delimiter}${env.PATH}`;
  delete env.USE_SYSTEM_WINE;
}

const r = spawnSync(process.execPath, [builder, '--win', '--x64', '--publish', 'never', ...process.argv.slice(2)], { stdio: 'inherit', env, cwd: ROOT });
process.exit(r.status == null ? 1 : r.status);
