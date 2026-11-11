#!/usr/bin/env node
'use strict';
// Makes sure build/content exists (catalogue, screenshots, videos) before start/dist.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CATALOG = path.join(ROOT, 'build', 'content', 'catalog.json');

function step(script) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

if (!fs.existsSync(CATALOG)) {
  console.log('No content yet. Downloading the catalogue from shoukugames.org…');
  step('fetch-content.js');
}
const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
if (catalog.games.some((g) => !g.video)) {
  console.log('Making gameplay videos…');
  step('make-videos.js');
}
