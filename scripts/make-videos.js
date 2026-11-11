#!/usr/bin/env node
'use strict';
// Makes a 20-second gameplay video for every game in build/content/catalog.json.
//
// If you drop a real gameplay recording into videos/<slug>.mp4 (or .webm/.mkv/.mov),
// it is trimmed to 20 seconds and used as is. Otherwise the video is built from the
// game's real screenshots with slow pan/zoom motion and cross-fades.
//
// Run with: npm run videos            (all games, skips ones already made)
//           npm run videos -- --force  (rebuild everything)
//           npm run videos -- math-fighter angled
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'content');
const CATALOG = path.join(OUT, 'catalog.json');
const RECORDINGS = path.join(ROOT, 'videos');
const WATERMARK = path.join(__dirname, 'watermark.png');

const DURATION = 20;
const FPS = 30;
const W = 1280;
const H = 720;
const FADE = 0.7;
const MAX_SHOTS = 6;

function run(args) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status})`);
}

function pick(list, n) {
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]);
}

function fromRecording(src, dest) {
  run([
    '-ss', '0', '-t', String(DURATION), '-i', src,
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0d2a44,fps=${FPS},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24',
    '-c:a', 'aac', '-b:a', '128k',
    '-t', String(DURATION), '-movflags', '+faststart', dest,
  ]);
}

function fromScreenshots(images, dest) {
  const n = images.length;
  const clip = n === 1 ? DURATION : (DURATION + (n - 1) * FADE) / n;
  const frames = Math.ceil(clip * FPS) + 2;
  const args = [];
  for (const img of images) args.push('-loop', '1', '-framerate', String(FPS), '-t', (1 / FPS).toFixed(4), '-i', img); // one frame; zoompan expands it
  args.push('-i', WATERMARK);

  // Each screenshot gets its own slow camera move so the video feels alive.
  const moves = [
    { z: `1+0.14*on/${frames}`, x: `(iw-iw/zoom)/2`, y: `(ih-ih/zoom)/2` }, // push in
    { z: `1.14-0.14*on/${frames}`, x: `(iw-iw/zoom)/2`, y: `(ih-ih/zoom)/2` }, // pull out
    { z: '1.12', x: `(iw-iw/zoom)*on/${frames}`, y: `(ih-ih/zoom)/2` }, // pan right
    { z: '1.12', x: `(iw-iw/zoom)*(1-on/${frames})`, y: `(ih-ih/zoom)/2` }, // pan left
  ];
  const parts = [];
  images.forEach((_, i) => {
    const m = moves[i % moves.length];
    parts.push(
      `[${i}:v]scale=${W * 3}:${H * 3}:force_original_aspect_ratio=increase,crop=${W * 3}:${H * 3},` +
        `zoompan=z='${m.z}':x='${m.x}':y='${m.y}':d=${frames}:s=${W}x${H}:fps=${FPS},` +
        `setpts=N/${FPS}/TB,fps=${FPS},trim=duration=${clip.toFixed(3)},format=yuv420p[v${i}]`,
    );
  });
  let last = 'v0';
  for (let i = 1; i < n; i++) {
    const offset = (i * (clip - FADE)).toFixed(3);
    parts.push(`[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset}[x${i}]`);
    last = `x${i}`;
  }
  parts.push(`[${n}:v]scale=84:84,format=rgba,colorchannelmixer=aa=0.85[wm]`);
  parts.push(`[${last}][wm]overlay=W-w-28:H-h-24,fade=t=in:st=0:d=0.5,fade=t=out:st=${DURATION - 0.6}:d=0.6,format=yuv420p[out]`);

  args.push(
    '-filter_complex', parts.join(';'),
    '-map', '[out]', '-t', String(DURATION), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', dest,
  );
  run(args);
}

function findRecording(slug) {
  if (!fs.existsSync(RECORDINGS)) return null;
  const f = fs.readdirSync(RECORDINGS).find((x) => new RegExp(`^${slug}\\.(mp4|webm|mkv|mov)$`, 'i').test(x));
  return f ? path.join(RECORDINGS, f) : null;
}

function main() {
  if (!fs.existsSync(CATALOG)) {
    console.error('No catalog yet. Run "npm run content" first.');
    process.exit(1);
  }
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const only = argv.filter((a) => !a.startsWith('--'));
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));

  for (const game of catalog.games) {
    if (only.length && !only.includes(game.slug)) continue;
    const rel = `media/${game.slug}/gameplay.mp4`;
    const dest = path.join(OUT, rel);
    const rec = findRecording(game.slug);
    const source = rec ? 'recording' : 'screenshots';
    if (!force && fs.existsSync(dest) && game.video && game.video.source === source) {
      console.log(`✓ ${game.title} (already made)`);
      continue;
    }
    const t0 = Date.now();
    if (rec) {
      fromRecording(rec, dest + '.tmp.mp4');
    } else {
      const shots = pick(game.screenshots.filter((s) => s.local).map((s) => path.join(OUT, s.local)), MAX_SHOTS);
      if (!shots.length) {
        console.warn(`! ${game.title}: no screenshots, skipping`);
        continue;
      }
      fromScreenshots(shots, dest + '.tmp.mp4');
    }
    fs.renameSync(dest + '.tmp.mp4', dest);
    game.video = { file: rel, duration: DURATION, source, poster: game.screenshots[0] && game.screenshots[0].local };
    fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2));
    console.log(`✓ ${game.title}: ${(fs.statSync(dest).size / 1048576).toFixed(1)} MB from ${source} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}

main();
