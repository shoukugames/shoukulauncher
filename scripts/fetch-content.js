#!/usr/bin/env node
'use strict';
// Downloads the catalogue and every screenshot from shoukugames.org into build/content/.
// Run with: npm run content
const fs = require('fs');
const path = require('path');
const { fetchCatalog } = require('../src/main/scraper');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'content');
const MEDIA = path.join(OUT, 'media');
const UA = 'ShoukuLauncher-build/1.0 (+https://shoukugames.org/)';

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest + '.part', buf);
  fs.renameSync(dest + '.part', dest);
}

async function main() {
  fs.mkdirSync(MEDIA, { recursive: true });
  const catalog = await fetchCatalog({ onProgress: (m) => console.log(m) });

  // Keep any previously generated video info (videos are made by make-videos.js).
  const oldPath = path.join(OUT, 'catalog.json');
  const old = fs.existsSync(oldPath) ? JSON.parse(fs.readFileSync(oldPath, 'utf8')) : { games: [] };
  const oldVideo = new Map(old.games.map((g) => [g.slug, g.video]));

  for (const game of catalog.games) {
    const dir = path.join(MEDIA, game.slug);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Screenshots: ${game.title} (${game.screenshots.length})`);
    for (const [i, shot] of game.screenshots.entries()) {
      const n = String(i + 1).padStart(2, '0');
      await download(shot.full, path.join(dir, `${n}.jpg`));
      await download(shot.thumb, path.join(dir, `${n}-thumb.jpg`));
      shot.local = `media/${game.slug}/${n}.jpg`;
      shot.localThumb = `media/${game.slug}/${n}-thumb.jpg`;
    }
    const v = oldVideo.get(game.slug);
    if (v && fs.existsSync(path.join(OUT, v.file))) game.video = v;
  }

  fs.writeFileSync(oldPath, JSON.stringify(catalog, null, 2));
  const win = catalog.games.filter((g) => g.downloads.windows).length;
  const lin = catalog.games.filter((g) => g.downloads.linux).length;
  console.log(`\nSaved ${catalog.games.length} games to ${path.relative(ROOT, oldPath)} (${win} with .exe, ${lin} with .deb).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
