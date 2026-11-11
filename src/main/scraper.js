'use strict';
// Reads the Shouku Games catalogue from https://shoukugames.org/.
// Used both by the build scripts (to bundle content) and by the launcher's
// "Check for new games" refresh. No dependencies: Node 18+ / Electron fetch.

const SITE = 'https://shoukugames.org';
const UA = 'ShoukuLauncher/1.0 (+https://shoukugames.org/)';

async function get(url, { asJson = false, timeoutMs = 30000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return asJson ? res.json() : res.text();
  } finally {
    clearTimeout(timer);
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', rarr: '→', larr: '←', hellip: '…', ndash: '–', mdash: '—' };
function decode(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));
}
const text = (html) => decode(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag);
  return m ? decode(m[1]) : null;
};

/** Returns the inner HTML of the first element whose opening tag matches `openRe`, balancing same-name tags. */
function block(html, openRe) {
  const m = openRe.exec(html);
  if (!m) return null;
  const tag = /^<([a-z0-9]+)/i.exec(m[0])[1];
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = m.index + m[0].length;
  let depth = 1;
  let t;
  while ((t = re.exec(html))) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(m.index + m[0].length, t.index);
  }
  return html.slice(m.index + m[0].length);
}

function parseSize(label) {
  const m = /([\d.]+)\s*(KB|MB|GB)/i.exec(label || '');
  if (!m) return null;
  const mult = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[m[2].toUpperCase()];
  return Math.round(parseFloat(m[1]) * mult);
}

function parseDownload(section) {
  if (!section || /is-empty/.test(section.head)) return null;
  const href = /<a[^>]+href="([^"]+)"[^>]*\bdownload\b/i.exec(section.body);
  if (!href) return null;
  const fileP = /<p class="dl__file">([\s\S]*?)<\/p>/i.exec(section.body);
  const sizeLabel = fileP ? text((/<span>([\s\S]*?)<\/span>/i.exec(fileP[1]) || [])[1]).replace(/^·\s*/, '') : null;
  const url = decode(href[1]);
  return {
    url,
    file: decodeURIComponent(url.split('/').pop()),
    sizeLabel,
    size: parseSize(sizeLabel),
  };
}

/** Parses one game page (e.g. https://shoukugames.org/games/math-fighter/). */
function parseGamePage(html) {
  const out = {};
  const page = /<div class="game-page"\s+style="--accent:\s*([^";]+)/i.exec(html);
  out.accent = page ? page[1].trim() : '#1f86d8';
  out.title = text(block(html, /<h1 class="game-hero__title"[^>]*>/i));
  out.lead = text(block(html, /<p class="game-hero__lead"[^>]*>/i));

  // Chips: category links + facts such as "Version 2.0.0", "Recommended for ages 6+".
  const chipsHtml = block(html, /<ul class="chips"[^>]*>/i) || '';
  out.categories = [];
  out.facts = [];
  for (const li of chipsHtml.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || []) {
    const label = text(li);
    if (/chip--link/.test(li)) out.categories.push(label);
    else if (label) out.facts.push(label);
  }
  const fact = (re) => {
    const f = out.facts.find((x) => re.test(x));
    return f ? f.replace(re, '').trim() : null;
  };
  out.version = fact(/^Version\s*/i);
  out.ages = fact(/^Recommended for ages\s*/i);
  out.practise = fact(/^Practi[sc]e:\s*/i);
  out.license = out.facts.find((x) => /^(GPL|MIT|Apache|BSD|MPL|LGPL|AGPL|CC)/i.test(x)) || null;

  // Screenshots.
  out.screenshots = [];
  const shotRe = /<a class="shot[^"]*" href="([^"]+)"[^>]*>\s*<img([^>]*)>/gi;
  let s;
  while ((s = shotRe.exec(html))) {
    out.screenshots.push({ full: decode(s[1]), thumb: attr(s[2], 'src') || decode(s[1]), alt: attr(s[2], 'alt') || '' });
  }
  if (!out.screenshots.length) {
    const hero = /<a class="tv" href="([^"]+)"/i.exec(html);
    if (hero) out.screenshots.push({ full: decode(hero[1]), thumb: decode(hero[1]), alt: out.title });
  }

  // Downloads, one block per platform.
  const dls = {};
  const dlRe = /<div class="dl dl--(linux|windows|android|mac)([^"]*)"[^>]*>/gi;
  let d;
  while ((d = dlRe.exec(html))) {
    const body = block(html.slice(d.index), /<div[^>]*>/i) || '';
    dls[d[1]] = { head: d[0], body };
  }
  out.downloads = {};
  const linux = parseDownload(dls.linux);
  const windows = parseDownload(dls.windows);
  // Strict type check: Linux entries must be .deb and Windows entries must be .exe.
  if (linux && /\.deb$/i.test(linux.file)) out.downloads.linux = linux;
  if (windows && /\.exe$/i.test(windows.file)) out.downloads.windows = windows;

  const gh = /<div class="source__head">[\s\S]*?<a href="(https:\/\/github\.com\/[^"]+)"/i.exec(html);
  out.github = gh ? decode(gh[1]) : null;
  const code = /<pre><code>([\s\S]*?)<\/code><\/pre>/i.exec(html);
  out.runFromSource = code ? decode(code[1]).trim() : null;
  return out;
}

/** Sniffs the first bytes of a Windows download to tell NSIS installers from portable executables. */
async function sniffWindowsKind(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Range: 'bytes=0-1048575' } });
    const buf = Buffer.from(await res.arrayBuffer());
    const ascii = buf.toString('latin1');
    if (ascii.includes('NullsoftInst') || ascii.includes('Nullsoft.NSIS')) return 'nsis';
    if (ascii.includes('Inno Setup')) return 'inno';
    return 'portable';
  } catch {
    return /setup/i.test(url) ? 'nsis' : 'portable';
  }
}

/**
 * Fetches the whole catalogue.
 * @param {{onProgress?: (msg: string) => void, sniff?: boolean}} opts
 */
async function fetchCatalog({ onProgress = () => {}, sniff = true } = {}) {
  onProgress('Reading game list…');
  const [posts, cats] = await Promise.all([
    get(`${SITE}/wp-json/wp/v2/game?per_page=100&_fields=id,slug,link,date,modified,title,excerpt,content,game_category,menu_order`, { asJson: true }),
    get(`${SITE}/wp-json/wp/v2/game_category?per_page=100&_fields=id,name,slug`, { asJson: true }).catch(() => []),
  ]);
  const catName = new Map(cats.map((c) => [c.id, decode(c.name)]));

  const games = [];
  for (const [i, p] of posts.entries()) {
    onProgress(`Reading ${text(p.title.rendered)} (${i + 1}/${posts.length})…`);
    const html = await get(p.link);
    const page = parseGamePage(html);
    const game = {
      id: p.id,
      slug: p.slug,
      url: p.link,
      title: page.title || text(p.title.rendered),
      summary: page.lead || text(p.excerpt.rendered),
      descriptionHtml: p.content.rendered,
      categories: page.categories.length ? page.categories : (p.game_category || []).map((id) => catName.get(id)).filter(Boolean),
      accent: page.accent,
      version: page.version,
      ages: page.ages,
      practise: page.practise,
      license: page.license,
      github: page.github,
      runFromSource: page.runFromSource,
      screenshots: page.screenshots,
      downloads: page.downloads,
      published: p.date,
      modified: p.modified,
    };
    if (sniff && game.downloads.windows) game.downloads.windows.kind = await sniffWindowsKind(game.downloads.windows.url);
    games.push(game);
  }
  return { source: SITE, fetchedAt: new Date().toISOString(), games };
}

/**
 * Keeps only the downloads for one platform and drops games that have none.
 * platform: 'windows' | 'linux'
 */
function filterForPlatform(catalog, platform) {
  const want = platform === 'windows' ? /\.exe$/i : /\.deb$/i;
  const games = catalog.games
    .map((g) => {
      // Already-staged catalogues carry a single `download` for their platform.
      const dl = g.downloads ? g.downloads[platform] : g.download && g.download.platform === platform ? g.download : null;
      if (!dl || !want.test(dl.file) || !want.test(new URL(dl.url).pathname)) return null;
      const { downloads, download, ...rest } = g;
      const out = { ...rest, download: { ...dl, platform } };
      // Debian file names are <package>_<version>_<arch>.deb, so the package name is known up front.
      if (platform === 'linux') out.download.package = dl.package || dl.file.split('_')[0].toLowerCase();
      return out;
    })
    .filter(Boolean);
  return { ...catalog, platform, games };
}

module.exports = { SITE, fetchCatalog, filterForPlatform, parseGamePage, decode, text };
