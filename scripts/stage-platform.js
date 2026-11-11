#!/usr/bin/env node
'use strict';
// Prepares build/stage/content for one platform before electron-builder runs.
//   node scripts/stage-platform.js win    -> only Windows .exe downloads
//   node scripts/stage-platform.js linux  -> only Debian/Ubuntu .deb downloads
// Games without a download for that platform are left out completely,
// and so is their media.
const fs = require('fs');
const path = require('path');
const { filterForPlatform } = require('../src/main/scraper');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'build', 'content');
const DEST = path.join(ROOT, 'build', 'stage', 'content');

const arg = (process.argv[2] || '').toLowerCase();
const platform = { win: 'windows', windows: 'windows', linux: 'linux', deb: 'linux' }[arg];
if (!platform) {
  console.error('Usage: node scripts/stage-platform.js <win|linux>');
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(path.join(SRC, 'catalog.json'), 'utf8'));
const filtered = filterForPlatform(catalog, platform);

const ext = platform === 'windows' ? '.exe' : '.deb';
for (const g of filtered.games) {
  if (!g.download.file.toLowerCase().endsWith(ext)) throw new Error(`${g.slug}: ${g.download.file} is not a ${ext}`);
}

fs.rmSync(path.join(ROOT, 'build', 'stage'), { recursive: true, force: true });
fs.mkdirSync(path.join(DEST, 'media'), { recursive: true });
for (const g of filtered.games) {
  const from = path.join(SRC, 'media', g.slug);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(DEST, 'media', g.slug), { recursive: true });
}
fs.writeFileSync(path.join(DEST, 'catalog.json'), JSON.stringify(filtered, null, 2));

const missingVideo = filtered.games.filter((g) => !g.video).map((g) => g.slug);
console.log(`Staged ${filtered.games.length} games for ${platform} (${ext} only).`);
if (missingVideo.length) console.warn(`Warning: no gameplay video for: ${missingVideo.join(', ')}`);
