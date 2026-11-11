'use strict';
/* Shouku Launcher renderer. Talks to the main process only through window.shouku (preload.js). */

const api = window.shouku;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $('#view');

const state = {
  catalog: { games: [], platform: 'linux' },
  lib: { games: {}, jobs: {}, queue: [], settings: {} },
  route: { view: 'store' },
  back: [],
  fwd: [],
  storeTab: 'all',
  featured: 0,
  libFilter: 'all',
  libQuery: '',
  storeQuery: '',
  bugDraft: null,
  sysInfo: null,
};

// ------------------------------------------------------------------ helpers

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const games = () => state.catalog.games;
const gameBy = (slug) => games().find((g) => g.slug === slug);
const isWin = () => state.catalog.platform === 'windows';

function fmtBytes(n) {
  if (!n) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i > 1 ? 1 : 0)} ${u[i]}`;
}
function fmtPlay(sec) {
  if (!sec) return 'Never played';
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))} minutes`;
  return `${(sec / 3600).toFixed(1)} hours`;
}
function fmtWhen(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

const ICON = {
  windows: '<svg viewBox="0 0 24 24"><path d="M3 5.4 10.6 4v7.4H3V5.4Zm8.8-1.6L21 2.2v9.2h-9.2V3.8ZM3 12.6h7.6V20L3 18.6v-6Zm8.8 0H21v9.2l-9.2-1.6v-7.6Z"/></svg>',
  linux: '<svg viewBox="0 0 24 24"><path d="M12 2c-3 0-4.6 2.3-4.6 5.4 0 1.7-.6 2.9-1.6 4.3C4.6 13.3 3.6 15 3.6 17c0 1 .7 1.4 1.5 1.7.8.4 1.4 1.2 1.9 2 .5.8 1.2 1.3 2.2 1 .9-.2 1.7-.4 2.8-.4s1.9.2 2.8.4c1 .3 1.7-.2 2.2-1 .5-.8 1.1-1.6 1.9-2 .8-.3 1.5-.7 1.5-1.7 0-2-1-3.7-2.2-5.3-1-1.4-1.6-2.6-1.6-4.3C16.6 4.3 15 2 12 2Zm-1.9 4.4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm3.8 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM12 9c1 0 2.4.6 2.4 1.2 0 .7-1.5 1.5-2.4 1.5s-2.4-.8-2.4-1.5C9.6 9.6 11 9 12 9Z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M10.5 3h3v9.2l3.4-3.4 2.1 2.1L12 17.9l-7-7 2.1-2.1 3.4 3.4V3ZM4 19h16v2.5H4V19Z"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5L19.4 13ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" transform="translate(-1 0)"/></svg>',
  search: '<svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/></svg>',
  github: '<svg viewBox="0 0 24 24"><path d="M12 1.8A10.2 10.2 0 0 0 8.8 21.7c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.6 1 1.6 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.7-1.4-2.3-.3-4.7-1.1-4.7-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .9-.3 2.8 1a9.6 9.6 0 0 1 5.1 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.7.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.7 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10.2 10.2 0 0 0 12 1.8Z"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 9h-3a15.6 15.6 0 0 0-1.3-5.9A8 8 0 0 1 18.9 11ZM12 4c.9 1.2 1.7 3.6 1.9 7h-3.8c.2-3.4 1-5.8 1.9-7ZM9.4 5.1A15.6 15.6 0 0 0 8.1 11h-3a8 8 0 0 1 4.3-5.9ZM5.1 13h3c.1 2.2.6 4.3 1.3 5.9A8 8 0 0 1 5.1 13Zm6.9 7c-.9-1.2-1.7-3.6-1.9-7h3.8c-.2 3.4-1 5.8-1.9 7Zm2.6-1.1c.7-1.6 1.2-3.7 1.3-5.9h3a8 8 0 0 1-4.3 5.9Z"/></svg>',
  bug: '<svg viewBox="0 0 24 24"><path d="M20 8h-2.8a6 6 0 0 0-1.8-2l1.6-1.6L15.6 3l-2.2 2.2a6 6 0 0 0-2.8 0L8.4 3 7 4.4 8.6 6a6 6 0 0 0-1.8 2H4v2h2.1a6 6 0 0 0-.1 1v1H4v2h2v1c0 .3 0 .7.1 1H4v2h2.8a6 6 0 0 0 10.4 0H20v-2h-2.1c.1-.3.1-.7.1-1v-1h2v-2h-2v-1c0-.3 0-.7-.1-1H20V8Zm-6 8h-4v-2h4v2Zm0-4h-4v-2h4v2Z"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Z"/></svg>',
  store: '<svg viewBox="0 0 24 24"><path d="M4 4h16l1 5a3 3 0 0 1-5 2.2A3 3 0 0 1 12 12a3 3 0 0 1-4-.8A3 3 0 0 1 3 9l1-5Zm1 9.5V20h14v-6.5a5 5 0 0 1-3 .5 5 5 0 0 1-4 0 5 5 0 0 1-4 0 5 5 0 0 1-3-.5Z"/></svg>',
  locate: '<svg viewBox="0 0 24 24"><path d="M12 2a7.5 7.5 0 0 0-7.5 7.5C4.5 15 12 22 12 22s7.5-7 7.5-12.5A7.5 7.5 0 0 0 12 2Zm0 10.2a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Z"/></svg>',
  rec: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3L12 3Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><path d="M3 5h18v14H3V5Zm2 2v.5l7 4.5 7-4.5V7H5Zm0 2.9V17h14V9.9l-7 4.5-7-4.5Z"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M5 3h11l5 5v13H3V3h2Zm2 2v4h8V5H7Zm5 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><path d="M8 3h11a2 2 0 0 1 2 2v12h-2V5H8V3ZM5 7h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M18.2 2.3h3.4l-7.3 8.3 8.6 11.4h-6.7l-5.3-6.9-6 6.9H1.5l7.8-8.9L1.1 2.3h6.9l4.8 6.3 5.4-6.3Zm-1.2 17.7h1.9L7.1 4.2h-2L17 20Z"/></svg>',
};
const CLOUD = '<svg viewBox="0 0 200 110" aria-hidden="true"><path fill="currentColor" d="M50 104a34 34 0 0 1-7-67.3A46 46 0 0 1 128 22a36 36 0 0 1 32 16 33 33 0 0 1-4 66H50Z"/></svg>';

const CAT_COLORS = {
  Math: ['#1f86d8', '#72cdf9'],
  Science: ['#15936c', '#3dd19c'],
  Geography: ['#0e7fa0', '#4fc3d9'],
  Language: ['#e2672a', '#ffab5e'],
  Typing: ['#6a52d9', '#a88bf0'],
  Technology: ['#17476f', '#2f9bea'],
  'Early learning': ['#d4467f', '#f68bb5'],
  Strategy: ['#c98a0f', '#ffc947'],
  Engines: ['#7d57d6', '#c09cff'],
};
const catColor = (c) => CAT_COLORS[c] || ['#17476f', '#1f86d8'];

/** Allow-list sanitiser for the game descriptions that come from the website. */
function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const ALLOWED = new Set(['H2', 'H3', 'H4', 'P', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'FIGURE', 'BR', 'A', 'CODE', 'PRE', 'BLOCKQUOTE', 'SPAN', 'KBD']);
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 8) { child.remove(); continue; }
      if (child.nodeType !== 1) continue;
      if (!ALLOWED.has(child.tagName)) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'IMG', 'VIDEO', 'AUDIO', 'SVG'].includes(child.tagName)) child.remove();
        else { walk(child); child.replaceWith(...child.childNodes); }
        continue;
      }
      const href = child.tagName === 'A' ? child.getAttribute('href') : null;
      const lang = child.getAttribute('lang');
      for (const a of [...child.attributes]) child.removeAttribute(a.name);
      if (href && /^https:\/\//i.test(href)) child.setAttribute('data-ext', href);
      if (lang) child.setAttribute('lang', lang);
      walk(child);
    }
  };
  const root = doc.body.firstChild;
  walk(root);
  $$('p', root).forEach((p) => { if (!p.textContent.trim() && !p.querySelector('br')) p.remove(); });
  return root.innerHTML;
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind ? 'is-' + kind : ''}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 5200);
}

async function attempt(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg, 'ok');
    return r;
  } catch (e) {
    toast(e.message, 'error');
    return undefined;
  }
}

// ------------------------------------------------------------------ status

function status(g) {
  const job = state.lib.jobs[g.slug];
  const e = state.lib.games[g.slug] || {};
  if (job) return { s: job.phase, job, e };
  if (e.running) return { s: 'running', e };
  if (e.installed) return { s: e.version && g.version && e.version !== g.version ? 'update' : 'installed', e };
  return { s: 'none', e };
}

function progressHtml(job) {
  const busy = job.phase !== 'downloading' || !job.total;
  const pct = job.total ? Math.min(100, (job.received / job.total) * 100) : 0;
  const label = {
    queued: 'Queued',
    downloading: `Downloading ${pct.toFixed(0)}%`,
    installing: job.message || 'Installing…',
    uninstalling: 'Uninstalling…',
  }[job.phase];
  const right = job.phase === 'downloading' ? `${fmtBytes(job.received)} / ${fmtBytes(job.total)} · ${fmtBytes(job.speed)}/s` : '';
  return `<div class="progress"><div class="progress__text"><span>${esc(label)}</span><span>${esc(right)}</span></div>
    <div class="progress__bar ${busy && job.phase !== 'queued' ? 'is-busy' : ''}"><span style="width:${pct}%"></span></div></div>`;
}

/** The big Steam-style action area for a game (PLAY / INSTALL / progress …). */
function actionHtml(g, size = 'big') {
  const { s, job } = status(g);
  const big = size === 'big' ? 'btn--big' : '';
  const slug = esc(g.slug);
  switch (s) {
    case 'queued':
    case 'downloading':
      return `${progressHtml(job)}<button class="btn btn--ghost btn--small" data-act="cancel" data-slug="${slug}">Cancel</button>`;
    case 'installing':
    case 'uninstalling':
      return progressHtml(job);
    case 'error':
      return `<span class="err">${esc(job.error)}</span><button class="btn btn--install ${size === 'big' ? '' : 'btn--small'}" data-act="retry" data-slug="${slug}">${ICON.download} Retry</button><button class="btn btn--ghost btn--small" data-act="cancel" data-slug="${slug}">Dismiss</button>`;
    case 'running':
      return `<button class="btn btn--stop ${big}" data-act="stop" data-slug="${slug}">${ICON.stop} Stop</button>`;
    case 'update':
      return `<button class="btn btn--play ${big}" data-act="play" data-slug="${slug}">${ICON.play} Play</button><button class="btn btn--sun ${size === 'big' ? '' : 'btn--small'}" data-act="install" data-slug="${slug}">${ICON.download} Update to ${esc(g.version)}</button>`;
    case 'installed':
      return `<button class="btn btn--play ${big}" data-act="play" data-slug="${slug}">${ICON.play} Play</button>`;
    default:
      return `<button class="btn btn--install ${big}" data-act="install" data-slug="${slug}">${ICON.download} Install</button>`;
  }
}

function statusTag(g) {
  const { s } = status(g);
  if (s === 'running') return '<span class="tag tag--installed">Running</span>';
  if (s === 'update') return '<span class="tag tag--update">Update</span>';
  if (s === 'installed') return '<span class="tag tag--installed">Installed</span>';
  if (['queued', 'downloading', 'installing'].includes(s)) return '<span class="tag">Installing</span>';
  return '<span class="tag tag--free">Free</span>';
}

const platformIcon = () => `<span class="platform-icons" title="${isWin() ? 'Windows' : 'Debian / Ubuntu'}">${isWin() ? ICON.windows : ICON.linux}</span>`;
const shot = (g, i = 0, thumb = true) => {
  const s = g.screenshots[i] || g.screenshots[0];
  return s ? esc(thumb ? s.thumbSrc : s.src) : 'img/shouku-logo.jpg';
};

// ------------------------------------------------------------------ routing

function go(route, { replace = false } = {}) {
  if (!replace) {
    state.back.push(state.route);
    state.fwd = [];
  }
  state.route = route;
  render();
  view.scrollTop = 0;
}
function goBack() {
  if (!state.back.length) return;
  state.fwd.push(state.route);
  state.route = state.back.pop();
  render();
}
function goFwd() {
  if (!state.fwd.length) return;
  state.back.push(state.route);
  state.route = state.fwd.pop();
  render();
}

let cleanup = [];
function render() {
  cleanup.forEach((f) => f());
  cleanup = [];
  const r = state.route;
  const navKey = r.view === 'game' ? 'store' : r.view;
  $$('[data-nav]').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === navKey));
  $('#nav-back').disabled = !state.back.length;
  $('#nav-fwd').disabled = !state.fwd.length;
  const fn = { store: renderStore, game: renderGame, library: renderLibrary, downloads: renderDownloads, bug: renderBug, about: renderAbout }[r.view] || renderStore;
  fn(r);
  renderStatusbar();
}

/** Refreshes only the parts that depend on install state, so videos keep playing. */
function updateDynamic() {
  $$('[data-action-for]').forEach((el) => {
    const g = gameBy(el.dataset.actionFor);
    if (g) el.innerHTML = actionHtml(g, el.dataset.size || 'big');
  });
  $$('[data-status-for]').forEach((el) => {
    const g = gameBy(el.dataset.statusFor);
    if (g) el.innerHTML = statusTag(g);
  });
  $$('[data-stats-for]').forEach((el) => {
    const g = gameBy(el.dataset.statsFor);
    if (g) el.innerHTML = statsHtml(g);
  });
  if (state.route.view === 'library') renderLibSideList();
  if (state.route.view === 'downloads') renderDownloads();
  renderStatusbar();
}

function renderStatusbar() {
  const installed = games().filter((g) => (state.lib.games[g.slug] || {}).installed).length;
  $('#sb-count').textContent = `Library · ${installed} of ${games().length} installed`;
  const jobs = Object.entries(state.lib.jobs).filter(([, j]) => j.phase !== 'error');
  const active = jobs.find(([, j]) => j.phase === 'downloading' || j.phase === 'installing');
  const fill = $('#sb-dl-fill');
  if (active) {
    const [slug, j] = active;
    const g = gameBy(slug);
    const pct = j.total ? (j.received / j.total) * 100 : 100;
    $('#sb-dl-text').textContent = `${g ? g.title : slug} · ${j.phase === 'downloading' ? `${pct.toFixed(0)}% · ${fmtBytes(j.speed)}/s` : 'installing'}${jobs.length > 1 ? ` · ${jobs.length - 1} queued` : ''}`;
    fill.style.width = `${pct}%`;
  } else {
    const errs = Object.values(state.lib.jobs).filter((j) => j.phase === 'error').length;
    $('#sb-dl-text').textContent = errs ? `${errs} download${errs > 1 ? 's' : ''} need attention` : 'Downloads · all done';
    fill.style.width = '0';
  }
  const src = { live: 'Synced with shoukugames.org', cache: 'Last sync', bundled: 'Bundled catalogue' }[state.catalog.source] || '';
  $('#sb-sync').textContent = `${src}${state.catalog.fetchedAt ? ' · ' + fmtWhen(state.catalog.fetchedAt) : ''}`;
}

// ------------------------------------------------------------------ STORE

function categories() {
  const m = new Map();
  for (const g of games()) for (const c of g.categories) m.set(c, (m.get(c) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function storeGames() {
  const r = state.route;
  let list = games().slice();
  if (r.cat) list = list.filter((g) => g.categories.includes(r.cat));
  const q = state.storeQuery.trim().toLowerCase();
  if (q) list = list.filter((g) => `${g.title} ${g.summary} ${g.categories.join(' ')} ${g.practise || ''}`.toLowerCase().includes(q));
  if (state.storeTab === 'new') list.sort((a, b) => String(b.published).localeCompare(String(a.published)));
  else if (state.storeTab === 'az') list.sort((a, b) => a.title.localeCompare(b.title));
  else if (state.storeTab === 'young') list.sort((a, b) => parseInt(a.ages || 99, 10) - parseInt(b.ages || 99, 10));
  return list;
}

function renderStore(r) {
  const list = games();
  if (!list.length) {
    view.innerHTML = `<div class="empty"><h2>No games yet</h2><p>Connect to the internet and press the refresh button to load the games from shoukugames.org.</p></div>`;
    return;
  }
  const featuredList = list.slice(0, Math.min(8, list.length));
  view.innerHTML = `
  <div class="store">
    <div class="store-sky"><span class="cloud c1">${CLOUD}</span><span class="cloud c2">${CLOUD}</span></div>
    <div class="wrap">
      <div class="store-nav"><div class="store-nav__bar">
        <a href="#" data-go="store" class="${!r.cat ? 'is-active' : ''}">Your Store</a>
        <a href="#" data-store-tab="new">New releases</a>
        <a href="#" data-go="library">Your library</a>
        <a href="#" data-ext="https://shoukugames.org/">shoukugames.org</a>
        <label class="search">${ICON.search}<input id="store-search" type="search" placeholder="Search the store" value="${esc(state.storeQuery)}" aria-label="Search the store"></label>
      </div></div>

      <div class="store-hero">
        <img src="img/shouku-logo.jpg" alt="Shouku Games logo">
        <div>
          <h1>Learning that feels like <span class="pop">playing</span>.</h1>
          <p>${list.length} free, open-source, bilingual games from Tokyo · <span class="jp" lang="ja">遊びながら学ぼう</span></p>
        </div>
      </div>

      ${r.cat || state.storeQuery ? '' : `
      <div class="section-head"><h2>Featured &amp; recommended</h2></div>
      <div class="featured" id="featured">
        <button class="featured__arrow prev" data-feat="-1" aria-label="Previous">‹</button>
        <div id="featured-slot"></div>
        <button class="featured__arrow next" data-feat="1" aria-label="Next">›</button>
        <div class="dots">${featuredList.map((_, i) => `<button data-feat-dot="${i}" aria-label="Show game ${i + 1}"></button>`).join('')}</div>
      </div>`}

      <div class="section-head"><h2>Browse by category</h2></div>
      <div class="cats">
        ${categories().map(([c, n]) => { const [c1, c2] = catColor(c); return `<button class="cat ${r.cat === c ? 'is-active' : ''}" style="--c1:${c1};--c2:${c2}" data-cat="${esc(c)}">${esc(c)}<small>${n} game${n > 1 ? 's' : ''}</small></button>`; }).join('')}
      </div>

      <div class="section-head"><h2>${r.cat ? esc(r.cat) + ' games' : state.storeQuery ? 'Search results' : 'All games'}</h2>
        ${r.cat ? '<a href="#" data-go="store">Show all games ›</a>' : ''}</div>
      <div class="tabs">
        ${[['all', 'Featured'], ['new', 'New releases'], ['az', 'A to Z'], ['young', 'Youngest players first']].map(([k, l]) => `<button data-store-tab="${k}" class="${state.storeTab === k ? 'is-active' : ''}">${l}</button>`).join('')}
      </div>
      <div class="store-list"><div class="store-list__rows" id="store-rows"></div><aside class="store-list__preview" id="store-preview"></aside></div>
    </div>
  </div>`;

  renderStoreRows();
  const search = $('#store-search');
  search.addEventListener('input', () => {
    state.storeQuery = search.value;
    renderStoreRows();
  });

  if ($('#featured')) {
    showFeatured(featuredList, state.featured % featuredList.length);
    const timer = setInterval(() => {
      if (!$('#featured') || $('#featured').matches(':hover')) return;
      showFeatured(featuredList, (state.featured + 1) % featuredList.length);
    }, 9000);
    cleanup.push(() => clearInterval(timer));
    $('#featured').addEventListener('click', (e) => {
      const d = e.target.closest('[data-feat]');
      const dot = e.target.closest('[data-feat-dot]');
      if (d) showFeatured(featuredList, (state.featured + Number(d.dataset.feat) + featuredList.length) % featuredList.length);
      else if (dot) showFeatured(featuredList, Number(dot.dataset.featDot));
    });
  }
}

function showFeatured(list, i) {
  state.featured = i;
  const g = list[i];
  const slot = $('#featured-slot');
  if (!slot || !g) return;
  slot.innerHTML = `
    <div class="featured__frame" style="--accent:${esc(g.accent)}" data-game="${esc(g.slug)}">
      <div class="featured__media" id="feat-media">
        <img src="${shot(g, 0, false)}" alt="">
        ${g.videoSrc ? `<video src="${esc(g.videoSrc)}" muted playsinline preload="none"></video>` : ''}
      </div>
      <div class="featured__side">
        <h3>${esc(g.title)}</h3>
        <div class="featured__thumbs">${[1, 2, 3, 4].filter((k) => g.screenshots[k]).map((k) => `<img src="${shot(g, k)}" alt="" data-feat-shot="${k}">`).join('')}</div>
        <p>${esc(g.summary)}</p>
        <div class="featured__foot">
          <div style="display:flex;gap:6px;flex-wrap:wrap">${g.categories.map((c) => `<span class="tag">${esc(c)}</span>`).join('')}</div>
          <span data-status-for="${esc(g.slug)}">${statusTag(g)}</span>
        </div>
      </div>
    </div>`;
  $$('[data-feat-dot]').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.featDot) === i));
  const media = $('#feat-media');
  const img = $('img', media);
  const video = $('video', media);
  // Steam-style: hovering the big capsule plays the gameplay video; hovering a thumbnail previews it.
  media.parentElement.addEventListener('mouseenter', () => {
    if (!video) return;
    video.currentTime = 0;
    video.play().then(() => media.classList.add('is-video')).catch(() => {});
  });
  media.parentElement.addEventListener('mouseleave', () => {
    if (video) { video.pause(); media.classList.remove('is-video'); }
    img.src = shot(g, 0, false);
  });
  $$('[data-feat-shot]', slot).forEach((t) => t.addEventListener('mouseenter', () => {
    if (video) { video.pause(); media.classList.remove('is-video'); }
    img.src = shot(g, Number(t.dataset.featShot), false);
  }));
}

function renderStoreRows() {
  const rows = $('#store-rows');
  if (!rows) return;
  const list = storeGames();
  if (!list.length) {
    rows.innerHTML = '<div class="empty">No games match your search.</div>';
    $('#store-preview').innerHTML = '';
    return;
  }
  rows.innerHTML = list.map((g) => `
    <div class="row" data-game="${esc(g.slug)}" data-preview="${esc(g.slug)}">
      <img src="${shot(g)}" alt="" loading="lazy">
      <div><h4>${esc(g.title)}</h4>
        <div class="meta">${platformIcon()}${g.categories.map((c) => `<span class="tag">${esc(c)}</span>`).join('')}${g.ages ? `<span class="tag">Ages ${esc(g.ages)}</span>` : ''}</div></div>
      <div class="right"><span data-status-for="${esc(g.slug)}">${statusTag(g)}</span><small style="color:var(--text-3)">${esc(fmtBytes(g.download.size))}</small></div>
    </div>`).join('');
  const preview = (slug) => {
    const g = gameBy(slug);
    $$('.row', rows).forEach((r) => r.classList.toggle('is-hot', r.dataset.preview === slug));
    $('#store-preview').innerHTML = `<h3>${esc(g.title)}</h3>
      <div class="tags">${g.categories.map((c) => `<span class="tag">${esc(c)}</span>`).join('')}${g.version ? `<span class="tag">v${esc(g.version)}</span>` : ''}</div>
      ${[1, 2, 3].filter((k) => g.screenshots[k]).map((k) => `<img src="${shot(g, k)}" alt="" loading="lazy">`).join('')}`;
  };
  rows.addEventListener('mouseover', (e) => {
    const row = e.target.closest('[data-preview]');
    if (row && !row.classList.contains('is-hot')) preview(row.dataset.preview);
  });
  preview(list[0].slug);
}

// ------------------------------------------------------------------ media player

function playerHtml(g) {
  const items = [];
  if (g.videoSrc) items.push({ type: 'video' });
  g.screenshots.forEach((_, i) => items.push({ type: 'img', i }));
  return `<div class="player" data-player="${esc(g.slug)}">
    <div class="player__stage"></div>
    <div class="player__strip">${items.map((it, k) => it.type === 'video'
      ? `<button class="is-video" data-item="${k}" title="Gameplay video (20 seconds)"><img src="${shot(g, 0)}" alt=""><span>0:${String(Math.round(g.video?.duration || 20)).padStart(2, '0')}</span></button>`
      : `<button data-item="${k}" title="${esc(g.screenshots[it.i].alt || 'Screenshot')}"><img src="${shot(g, it.i)}" alt="" loading="lazy"></button>`).join('')}</div>
  </div>`;
}

function setupPlayer(root, g) {
  const el = $('[data-player]', root);
  if (!el) return;
  const items = [];
  if (g.videoSrc) items.push({ type: 'video' });
  g.screenshots.forEach((_, i) => items.push({ type: 'img', i }));
  const stage = $('.player__stage', el);
  let cur = -1;
  let timer = null;
  const show = (k, { auto = false } = {}) => {
    clearTimeout(timer);
    cur = k;
    const it = items[k];
    $$('[data-item]', el).forEach((b) => b.classList.toggle('is-active', Number(b.dataset.item) === k));
    // Scroll only the thumbnail strip sideways (scrollIntoView would also scroll the page).
    const btn = $(`[data-item="${k}"]`, el);
    const strip = $('.player__strip', el);
    if (btn && strip) {
      const left = btn.offsetLeft - strip.offsetLeft;
      if (left < strip.scrollLeft || left + btn.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollTo({ left: left - 8, behavior: 'smooth' });
    }
    if (!it) return;
    if (it.type === 'video') {
      const autoplay = state.lib.settings.autoplayVideos !== false;
      stage.innerHTML = `<video src="${esc(g.videoSrc)}" controls ${autoplay ? 'autoplay' : ''} muted playsinline poster="${shot(g, 0, false)}"></video>
        <span class="player__badge">${ICON.rec} Gameplay · 20s</span>`;
      const v = $('video', stage);
      v.addEventListener('ended', () => show((k + 1) % items.length, { auto: true }));
    } else {
      stage.innerHTML = `<img src="${shot(g, it.i, false)}" alt="${esc(g.screenshots[it.i].alt)}">`;
      $('img', stage).addEventListener('click', () => openLightbox(g, it.i));
      if (auto) timer = setTimeout(() => show((k + 1) % items.length, { auto: true }), 5000);
    }
  };
  $('.player__strip', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-item]');
    if (b) show(Number(b.dataset.item));
  });
  show(0);
  cleanup.push(() => clearTimeout(timer));
}

let lb = { g: null, i: 0 };
function openLightbox(g, i) {
  lb = { g, i };
  $('#lightbox-img').src = shot(g, i, false);
  $('#lightbox').hidden = false;
}
function lightboxStep(d) {
  if (!lb.g) return;
  lb.i = (lb.i + d + lb.g.screenshots.length) % lb.g.screenshots.length;
  $('#lightbox-img').src = shot(lb.g, lb.i, false);
}

// ------------------------------------------------------------------ GAME (store page)

function detailsHtml(g) {
  const dl = g.download;
  return `<dl class="kv">
    <dt>Developer</dt><dd>Shouku Games</dd>
    <dt>Released</dt><dd>${esc(fmtDate(g.published))}</dd>
    <dt>Version</dt><dd>${esc(g.version || '—')}</dd>
    ${g.ages ? `<dt>Ages</dt><dd>${esc(g.ages)}</dd>` : ''}
    ${g.practise ? `<dt>Practise</dt><dd>${esc(g.practise)}</dd>` : ''}
    <dt>Languages</dt><dd>English, 日本語</dd>
    <dt>Licence</dt><dd>${esc(g.license || 'Open source')}</dd>
    <dt>Download</dt><dd>${esc(dl.file)} · ${esc(dl.sizeLabel || fmtBytes(dl.size))}</dd>
  </dl>`;
}

function linksHtml(g) {
  return `<div class="links">
    <button data-ext="${esc(g.url)}">${ICON.globe} Game page on shoukugames.org</button>
    ${g.github ? `<button data-ext="${esc(g.github)}">${ICON.github} Source code on GitHub</button>` : ''}
    <button data-go="bug" data-slug="${esc(g.slug)}">${ICON.bug} Report a bug</button>
  </div>`;
}

function renderGame(r) {
  const g = gameBy(r.slug);
  if (!g) return go({ view: 'store' }, { replace: true });
  view.innerHTML = `
  <div class="game" style="--accent:${esc(g.accent)}">
    <div class="game__bg" style="background-image:url('${shot(g, 0)}')"></div>
    <div class="wrap">
      <div class="crumbs"><a href="#" data-go="store">All games</a> › ${g.categories.map((c) => `<a href="#" data-cat="${esc(c)}">${esc(c)}</a>`).join(', ')} › ${esc(g.title)}</div>
      <h1 class="game__title">${esc(g.title)}</h1>
      <div class="game__top">
        ${playerHtml(g)}
        <div class="capsule-side">
          <img src="${shot(g, 0, false)}" alt="">
          <p class="summary">${esc(g.summary)}</p>
          ${detailsHtml(g)}
          <div class="tags">${g.categories.map((c) => `<span class="tag" style="cursor:pointer" data-cat="${esc(c)}">${esc(c)}</span>`).join('')}<span class="tag">Bilingual</span><span class="tag">Offline</span><span class="tag">Ad free</span></div>
        </div>
      </div>

      <div class="game__body">
        <div>
          <div class="buybox">
            <h2>${status(g).e.installed ? 'Play' : 'Install'} ${esc(g.title)}</h2>
            <div class="sub">${platformIcon()} ${isWin() ? 'Windows' : 'Debian / Ubuntu'} · ${esc(g.download.file)} · <span data-status-for="${esc(g.slug)}">${statusTag(g)}</span></div>
            <div class="buybox__action"><span class="buybox__price">FREE</span><div style="display:flex;gap:6px;align-items:center" data-action-for="${esc(g.slug)}" data-size="small">${actionHtml(g, 'small')}</div></div>
          </div>
          <section class="about"><h2>About this game</h2><div class="prose">${sanitize(g.descriptionHtml)}</div></section>
        </div>
        <aside>
          <div class="sidebox"><h3>Links</h3>${linksHtml(g)}</div>
          <div class="sidebox"><h3>System requirements</h3><div class="sysreq">
            ${isWin() ? '<p><b>OS:</b> Windows 10 or 11 (64-bit)</p>' : '<p><b>OS:</b> Debian 12+, Ubuntu 22.04+ or another Debian-based distribution</p>'}
            <p><b>Storage:</b> ${esc(g.download.sizeLabel || fmtBytes(g.download.size))} download</p>
            <p><b>Internet:</b> only to download. Games play offline.</p></div></div>
          ${g.runFromSource ? `<div class="sidebox"><h3>Run from source</h3><div class="prose"><pre>${esc(g.runFromSource)}</pre></div></div>` : ''}
        </aside>
      </div>
    </div>
  </div>`;
  setupPlayer(view, g);
}

// ------------------------------------------------------------------ LIBRARY

function libList() {
  const q = state.libQuery.trim().toLowerCase();
  return games()
    .filter((g) => !q || g.title.toLowerCase().includes(q))
    .filter((g) => {
      const inst = (state.lib.games[g.slug] || {}).installed;
      return state.libFilter === 'all' || (state.libFilter === 'installed' ? inst : !inst);
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function renderLibrary(r) {
  view.innerHTML = `
  <div class="library">
    <aside class="lib-side">
      <div class="lib-side__home ${!r.slug ? 'is-active' : ''}" data-go="library">${ICON.home} Home</div>
      <div class="lib-side__tools">
        <label class="search">${ICON.search}<input id="lib-search" type="search" placeholder="Search" value="${esc(state.libQuery)}" aria-label="Search your library"></label>
        <select id="lib-filter" aria-label="Filter">
          <option value="all">All</option><option value="installed">Installed</option><option value="not">Not installed</option>
        </select>
      </div>
      <div class="lib-side__list" id="lib-list"></div>
    </aside>
    <section class="lib-main" id="lib-main"></section>
  </div>`;
  $('#lib-filter').value = state.libFilter;
  $('#lib-filter').addEventListener('change', (e) => { state.libFilter = e.target.value; renderLibSideList(); });
  $('#lib-search').addEventListener('input', (e) => { state.libQuery = e.target.value; renderLibSideList(); });
  renderLibSideList();
  if (r.slug && gameBy(r.slug)) renderLibGame(gameBy(r.slug));
  else renderLibHome();
}

function renderLibSideList() {
  const el = $('#lib-list');
  if (!el) return;
  const list = libList();
  const inst = list.filter((g) => (state.lib.games[g.slug] || {}).installed);
  const rest = list.filter((g) => !(state.lib.games[g.slug] || {}).installed);
  const item = (g) => {
    const { s } = status(g);
    const badge = { running: 'Running', update: 'Update', downloading: '↓', queued: 'Queued', installing: '…', error: '!' }[s] || '';
    return `<div class="lib-item ${['installed', 'update', 'running'].includes(s) ? 'is-installed' : ''} ${s === 'running' ? 'is-running' : ''} ${state.route.slug === g.slug ? 'is-active' : ''}" data-lib="${esc(g.slug)}">
      <img src="${shot(g)}" alt=""><span>${esc(g.title)}</span>${badge ? `<small>${badge}</small>` : ''}</div>`;
  };
  el.innerHTML = (inst.length ? `<div class="lib-group">Installed (${inst.length})</div>${inst.map(item).join('')}` : '') +
    (rest.length ? `<div class="lib-group">Ready to install (${rest.length})</div>${rest.map(item).join('')}` : '') +
    (!list.length ? '<div class="empty">Nothing found</div>' : '');
}

function capHtml(g) {
  const inst = (state.lib.games[g.slug] || {}).installed;
  return `<div class="cap ${inst ? '' : 'is-off'}" style="--accent:${esc(g.accent)}" data-lib="${esc(g.slug)}">
    <img src="${shot(g)}" alt="" loading="lazy">
    ${inst ? `<button class="cap__play" data-act="play" data-slug="${esc(g.slug)}" aria-label="Play ${esc(g.title)}">${ICON.play}</button>` : ''}
    <div class="cap__name"><span>${esc(g.title)}</span><span data-status-for="${esc(g.slug)}">${statusTag(g)}</span></div>
  </div>`;
}

function renderLibHome() {
  const recent = games().filter((g) => (state.lib.games[g.slug] || {}).lastPlayed).sort((a, b) => state.lib.games[b.slug].lastPlayed.localeCompare(state.lib.games[a.slug].lastPlayed)).slice(0, 4);
  const all = games().slice().sort((a, b) => a.title.localeCompare(b.title));
  $('#lib-main').innerHTML = `<div class="lib-home">
    ${recent.length ? `<div class="section-head" style="margin-top:4px"><h2>Recent games</h2></div><div class="recent">${recent.map(capHtml).join('')}</div>` : `
      <div class="panel" style="display:flex;gap:18px;align-items:center;margin-top:6px">
        <img src="img/icon-128.png" alt="" style="width:64px;height:64px">
        <div><h2 style="font-size:20px">Welcome to your library</h2><p style="margin:4px 0 0;color:var(--text-2)">Every Shouku game is free. Pick one below and press <b>Install</b>; it downloads the ${isWin() ? 'Windows .exe' : 'Debian/Ubuntu .deb'} and gets it ready to play.</p></div>
      </div>`}
    <div class="section-head"><h2>All games (${all.length})</h2></div>
    <div class="shelf">${all.map(capHtml).join('')}</div>
  </div>`;
}

function statsHtml(g) {
  const { e } = status(g);
  return `<div class="stat"><b>Last played</b><span>${esc(fmtWhen(e.lastPlayed))}</span></div>
    <div class="stat"><b>Play time</b><span>${esc(fmtPlay(e.playSeconds))}</span></div>
    <div class="stat"><b>Version</b><span>${esc(e.installed ? e.version || g.version : g.version || '—')}</span></div>
    <div class="stat"><b>Size</b><span>${esc(g.download.sizeLabel || fmtBytes(g.download.size))}</span></div>`;
}

function renderLibGame(g) {
  $('#lib-main').innerHTML = `<div class="lib-game" style="--accent:${esc(g.accent)}">
    <div class="lib-hero"><img src="${shot(g, 0, false)}" alt="">
      <div class="lib-hero__title"><h1>${esc(g.title)}</h1><p>${esc(g.summary)}</p></div></div>
    <div class="actionbar">
      <div style="display:flex;gap:10px;align-items:center" data-action-for="${esc(g.slug)}" data-size="big">${actionHtml(g)}</div>
      <div style="display:flex;gap:26px" data-stats-for="${esc(g.slug)}">${statsHtml(g)}</div>
      <div class="actionbar__right">
        <button class="icon-btn" data-go="game" data-slug="${esc(g.slug)}" title="Store page">${ICON.store}</button>
        <button class="icon-btn" data-go="bug" data-slug="${esc(g.slug)}" title="Report a bug">${ICON.bug}</button>
        <button class="icon-btn" data-act="menu" data-slug="${esc(g.slug)}" title="Manage">${ICON.gear}</button>
      </div>
    </div>
    <div class="lib-game__body">
      <div>${playerHtml(g)}
        <section class="about" style="margin-top:24px"><h2>About this game</h2><div class="prose">${sanitize(g.descriptionHtml)}</div></section></div>
      <aside>
        <div class="sidebox"><h3>Details</h3>${detailsHtml(g)}</div>
        <div class="sidebox"><h3>Links</h3>${linksHtml(g)}</div>
      </aside>
    </div>
  </div>`;
  setupPlayer($('#lib-main'), g);
}

function openMenu(btn, slug) {
  closeMenus();
  const g = gameBy(slug);
  const e = state.lib.games[slug] || {};
  const m = document.createElement('div');
  m.className = 'menu';
  m.innerHTML = `
    ${e.installed ? `<button data-act="folder" data-slug="${esc(slug)}">${ICON.folder} Browse local files</button>` : ''}
    ${e.installed ? `<button data-act="locate" data-slug="${esc(slug)}">${ICON.locate} Set game ${isWin() ? '.exe' : 'command'}…</button>` : ''}
    ${!e.installed ? `<button data-act="install" data-slug="${esc(slug)}">${ICON.download} Install</button>` : `<button data-act="install" data-slug="${esc(slug)}">${ICON.download} Reinstall</button>`}
    <hr>
    <button data-ext="${esc(g.url)}">${ICON.globe} Open game page</button>
    ${g.github ? `<button data-ext="${esc(g.github)}">${ICON.github} Source code</button>` : ''}
    ${e.installed ? `<hr><button data-act="uninstall" data-slug="${esc(slug)}" class="btn--danger">${ICON.trash} Uninstall</button>` : ''}`;
  btn.parentElement.append(m);
}
const closeMenus = () => $$('.menu').forEach((m) => m.remove());

// ------------------------------------------------------------------ DOWNLOADS

function renderDownloads() {
  const jobs = Object.entries(state.lib.jobs);
  const active = jobs.find(([, j]) => ['downloading', 'installing', 'uninstalling'].includes(j.phase));
  const queued = state.lib.queue.map((s) => [s, state.lib.jobs[s]]).filter(([, j]) => j);
  const errors = jobs.filter(([, j]) => j.phase === 'error');
  const recent = games().filter((g) => !state.lib.jobs[g.slug] && (state.lib.games[g.slug] || {}).installedAt && (state.lib.games[g.slug] || {}).installed)
    .sort((a, b) => state.lib.games[b.slug].installedAt.localeCompare(state.lib.games[a.slug].installedAt)).slice(0, 8);
  const row = (g, right, sub) => `<div class="dl-row"><img src="${shot(g)}" alt=""><div><h4>${esc(g.title)}</h4><p>${sub}</p></div><div style="display:flex;gap:8px;align-items:center">${right}</div></div>`;
  const scroll = view.scrollTop;
  view.innerHTML = `<div class="downloads"><div class="wrap">
    <div class="section-head" style="margin-top:0"><h2>Downloading</h2></div>
    ${active ? (() => { const g = gameBy(active[0]); return g ? `<div class="dl-now"><img src="${shot(g, 0, false)}" alt=""><div><h2>${esc(g.title)}</h2>
      <p style="color:var(--text-2);margin:0 0 14px">${esc(g.download.file)} from shoukugames.org</p>
      <div style="display:flex;gap:10px;align-items:center" data-action-for="${esc(g.slug)}">${actionHtml(g)}</div></div></div>` : ''; })() : '<div class="panel" style="color:var(--text-3)">Nothing is downloading right now. Find something new in the <a href="#" data-go="store">store</a>.</div>'}
    ${queued.length ? `<div class="section-head"><h2>Up next (${queued.length})</h2></div>${queued.map(([s]) => { const g = gameBy(s); return g ? row(g, `<button class="btn btn--ghost btn--small" data-act="cancel" data-slug="${esc(s)}">Remove</button>`, `${esc(g.download.sizeLabel || fmtBytes(g.download.size))} · queued`) : ''; }).join('')}` : ''}
    ${errors.length ? `<div class="section-head"><h2>Needs attention</h2></div>${errors.map(([s, j]) => { const g = gameBy(s); return g ? row(g, `<button class="btn btn--install btn--small" data-act="retry" data-slug="${esc(s)}">Retry</button><button class="btn btn--ghost btn--small" data-act="cancel" data-slug="${esc(s)}">Dismiss</button>`, `<span class="err">${esc(j.error)}</span>`) : ''; }).join('')}` : ''}
    ${recent.length ? `<div class="section-head"><h2>Completed</h2></div>${recent.map((g) => row(g, `<div data-action-for="${esc(g.slug)}" data-size="small" style="display:flex;gap:8px">${actionHtml(g, 'small')}</div>`, `Installed ${esc(fmtWhen(state.lib.games[g.slug].installedAt))} · version ${esc(state.lib.games[g.slug].version || g.version)}`)).join('')}` : ''}
  </div></div>`;
  view.scrollTop = scroll;
}

// ------------------------------------------------------------------ BUG REPORT

const BUG_TYPES = ['Crash or will not start', 'Install or download', 'Gameplay', 'Graphics or sound', 'Text or translation', 'Launcher', 'Other'];

function bugDraft(r) {
  if (!state.bugDraft) state.bugDraft = { slug: '', type: BUG_TYPES[0], often: 'Always', title: '', what: '', steps: '', expected: '', email: '', sys: true, log: true };
  if (r.slug !== undefined) state.bugDraft.slug = r.slug;
  return state.bugDraft;
}

function bugMarkdown(d, logText) {
  const g = d.slug ? gameBy(d.slug) : null;
  const e = g ? state.lib.games[g.slug] || {} : {};
  const steps = d.steps.split('\n').map((s) => s.trim()).filter(Boolean).map((s, i) => (/^\d+[.)]/.test(s) ? s : `${i + 1}. ${s}`)).join('\n');
  const info = state.sysInfo || {};
  const lines = [
    `# ${d.title.trim() || '(no summary)'}`,
    '',
    `**Game:** ${g ? `${g.title} (catalogue version ${g.version || '?'}${e.installed ? `, installed ${e.version || '?'}` : ', not installed'})` : 'Shouku Launcher'}`,
    `**Type:** ${d.type}`,
    `**How often:** ${d.often}`,
    '',
    '## What happened',
    d.what.trim() || '_Not given_',
    '',
    '## Steps to reproduce',
    steps || '_Not given_',
    '',
    '## What I expected',
    d.expected.trim() || '_Not given_',
  ];
  if (d.sys) {
    lines.push('', '## System', `- Launcher: ${info.launcherVersion} (${info.platform === 'windows' ? 'Windows .exe edition' : 'Debian/Ubuntu .deb edition'})`, `- OS: ${info.os}${info.osVersion ? ` · ${info.osVersion}` : ''}`,
      `- CPU / RAM: ${info.cpu} / ${info.memory}`, `- Electron: ${info.electron} · Locale: ${info.locale}`);
    if (g) lines.push(`- Download: ${g.download.file}`);
  }
  if (d.log && logText) lines.push('', '<details><summary>Launcher log (last lines)</summary>', '', '```', logText.trim(), '```', '</details>');
  if (d.email.trim()) lines.push('', `**Contact:** ${d.email.trim()}`);
  lines.push('', '_Sent from Shouku Launcher_');
  return lines.join('\n');
}

async function renderBug(r) {
  const d = bugDraft(r);
  if (!state.sysInfo) state.sysInfo = await api.systemInfo().catch(() => ({}));
  const logText = await api.logTail().catch(() => '');
  if (state.route.view !== 'bug') return;
  const sorted = games().slice().sort((a, b) => a.title.localeCompare(b.title));
  view.innerHTML = `<div class="bug"><div class="wrap">
    <div class="bug__head"><div class="bubble">${ICON.bug}</div>
      <div><h1>Report a bug</h1><p>Found something broken? Tell us what happened and we will fix it. Reports go to the game's GitHub issues or to <b>info@shoukugames.org</b>.</p></div></div>
    <div class="bug__grid">
      <form class="panel" id="bug-form" novalidate>
        <div class="two">
          <div class="field"><label for="bug-game">What is the problem with?</label>
            <select id="bug-game"><option value="">Shouku Launcher (this app)</option>${sorted.map((g) => `<option value="${esc(g.slug)}">${esc(g.title)}</option>`).join('')}</select></div>
          <div class="field"><span class="label">How often does it happen?</span>
            <div class="chips">${['Always', 'Sometimes', 'Once'].map((o) => `<label><input type="radio" name="often" value="${o}"><span>${o}</span></label>`).join('')}</div></div>
        </div>
        <div class="field"><span class="label">What kind of problem?</span>
          <div class="chips">${BUG_TYPES.map((t) => `<label><input type="radio" name="type" value="${esc(t)}"><span>${esc(t)}</span></label>`).join('')}</div></div>
        <div class="field" data-f="title"><label for="bug-title">Summary</label>
          <input type="text" id="bug-title" maxlength="120" placeholder="e.g. Game closes when I pick the Division Ninja">
          <span class="error" hidden>Please write a short summary (at least 8 characters).</span></div>
        <div class="field" data-f="what"><label for="bug-what">What happened?</label>
          <textarea id="bug-what" placeholder="Describe the problem. Error messages help a lot."></textarea>
          <span class="error" hidden>Please tell us what happened.</span></div>
        <div class="two">
          <div class="field"><label for="bug-steps">Steps to make it happen again</label>
            <textarea id="bug-steps" placeholder="One step per line&#10;Open the game&#10;Choose Tournament&#10;…"></textarea></div>
          <div class="field"><label for="bug-expected">What did you expect?</label>
            <textarea id="bug-expected" placeholder="What should have happened instead?"></textarea></div>
        </div>
        <div class="field"><label for="bug-email">Email (optional)</label>
          <input type="email" id="bug-email" placeholder="So we can ask you questions">
          <span class="hint">Only added to the report if you fill it in. GitHub issues are public.</span></div>
        <label class="check"><input type="checkbox" id="bug-sys"> Include system information (OS, launcher version, game version)</label>
        <label class="check"><input type="checkbox" id="bug-log"> Include the last lines of the launcher log</label>
        <div class="bug__actions">
          <button type="button" class="btn btn--sun" data-bug="github">${ICON.github} Open GitHub issue</button>
          <button type="button" class="btn btn--install" data-bug="email">${ICON.mail} Send by email</button>
          <button type="button" class="btn btn--ghost" data-bug="save">${ICON.save} Save report…</button>
          <button type="button" class="btn btn--ghost" data-bug="copy">${ICON.copy} Copy</button>
          <button type="button" class="btn btn--ghost" data-bug="clear" style="margin-left:auto">Clear</button>
        </div>
      </form>
      <aside>
        <div class="panel" style="margin-bottom:16px"><h3 style="font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-2);margin-bottom:10px">Preview</h3><div class="preview" id="bug-preview"></div></div>
        <div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-2)">Your saved reports</h3><button class="btn btn--ghost btn--small" data-bug="folder">${ICON.folder} Open</button></div><ul class="history" id="bug-history"></ul></div>
      </aside>
    </div></div></div>`;

  const f = $('#bug-form');
  $('#bug-game').value = d.slug;
  $(`input[name=often][value="${d.often}"]`, f).checked = true;
  const typeInput = $$('input[name=type]', f).find((i) => i.value === d.type);
  if (typeInput) typeInput.checked = true;
  $('#bug-title').value = d.title;
  $('#bug-what').value = d.what;
  $('#bug-steps').value = d.steps;
  $('#bug-expected').value = d.expected;
  $('#bug-email').value = d.email;
  $('#bug-sys').checked = d.sys;
  $('#bug-log').checked = d.log;

  const sync = () => {
    d.slug = $('#bug-game').value;
    d.often = ($('input[name=often]:checked', f) || {}).value || 'Always';
    d.type = ($('input[name=type]:checked', f) || {}).value || BUG_TYPES[0];
    d.title = $('#bug-title').value;
    d.what = $('#bug-what').value;
    d.steps = $('#bug-steps').value;
    d.expected = $('#bug-expected').value;
    d.email = $('#bug-email').value;
    d.sys = $('#bug-sys').checked;
    d.log = $('#bug-log').checked;
    $('#bug-preview').textContent = bugMarkdown(d, logText);
  };
  f.addEventListener('input', sync);
  f.addEventListener('change', sync);
  sync();

  const validate = () => {
    let ok = true;
    const set = (key, bad) => {
      const field = $(`[data-f="${key}"]`, f);
      field.classList.toggle('is-invalid', bad);
      $('.error', field).hidden = !bad;
      if (bad) ok = false;
    };
    set('title', d.title.trim().length < 8);
    set('what', d.what.trim().length < 1);
    if (!ok) toast('Please fill in the highlighted fields.', 'error');
    return ok;
  };
  const report = () => ({ slug: d.slug, title: d.title.trim(), markdown: bugMarkdown(d, logText) });
  const loadHistory = async () => {
    const h = await api.bug.history().catch(() => []);
    $('#bug-history').innerHTML = h.length ? h.map((x) => `<li title="${esc(x.file)}">${esc(x.title)}</li>`).join('') : '<li style="color:var(--text-3)">No reports yet</li>';
  };
  loadHistory();

  $('.bug__grid').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-bug]');
    if (!b) return;
    const act = b.dataset.bug;
    if (act === 'folder') return attempt(() => api.bug.openFolder());
    if (act === 'clear') { state.bugDraft = null; return renderBug({ view: 'bug' }); }
    if (!validate()) return;
    const rep = report();
    if (act === 'copy') {
      await navigator.clipboard.writeText(rep.markdown).then(() => toast('Report copied to the clipboard.', 'ok'), () => toast('Could not copy.', 'error'));
      return;
    }
    const saved = await attempt(() => api.bug.save(rep, act === 'save'));
    if (act === 'save' && saved) toast(`Saved to ${saved}`, 'ok');
    if (act === 'github') {
      const url = await attempt(() => api.bug.issueUrl(rep));
      if (url) { await attempt(() => api.openExternal(url)); toast('Opening GitHub in your browser. Sign in and press "Submit new issue".', 'ok'); }
    }
    if (act === 'email') { await attempt(() => api.bug.email(rep)); toast('Opening your email app…', 'ok'); }
    loadHistory();
  });
}

// ------------------------------------------------------------------ ABOUT

function renderAbout() {
  const info = state.sysInfo || {};
  view.innerHTML = `<div class="about-page">
    <span class="cloud" style="width:260px;left:-40px;top:40px">${CLOUD}</span>
    <span class="cloud" style="width:180px;right:6%;top:20px">${CLOUD}</span>
    <span class="cloud" style="width:120px;right:30%;top:220px">${CLOUD}</span>
    <div class="wrap">
      <div class="about-page__inner">
        <img class="about-page__logo" src="img/shouku-logo.jpg" alt="Shouku Games logo: a smiling blue cloud with wings holding a learning tablet">
        <div>
          <p class="eyebrow" style="color:var(--mist)">Open-source game studio · Tokyo, Japan</p>
          <h1>Learning that feels like <span class="pop">playing</span>.</h1>
          <p class="jp" lang="ja" style="font-size:20px;margin:6px 0 10px">遊びながら学ぼう</p>
          <p>Shouku Games makes bilingual, educational games with the emphasis on having fun while learning. Our games are for everyone, no matter the age.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
            <button class="btn btn--sun" data-ext="https://shoukugames.org/">${ICON.globe} shoukugames.org</button>
            <button class="btn" data-ext="https://github.com/shoukugames">${ICON.github} GitHub</button>
            <button class="btn" data-ext="https://x.com/shoukugames">${ICON.x} @shoukugames</button>
            <button class="btn" data-ext="mailto:info@shoukugames.org">${ICON.mail} info@shoukugames.org</button>
          </div>
        </div>
      </div>
      <div class="values">
        <div class="value" style="--c:#72cdf9"><h3>Open source</h3><p>Every line of code is on GitHub for you to read, learn from and build on.</p></div>
        <div class="value" style="--c:#ff8a3d"><h3>Bilingual</h3><p>All of our games are in English and <span lang="ja">日本語</span>.</p></div>
        <div class="value" style="--c:#3dd19c"><h3>Educational</h3><p>Fun first. Nobody should notice they are studying.</p></div>
        <div class="value" style="--c:#f68bb5"><h3>For everyone</h3><p>Offline and 100% ad free, for every age.</p></div>
      </div>
      <div class="panel" style="margin-bottom:40px">
        <h3 style="font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-2);margin-bottom:12px">About this launcher</h3>
        <dl class="kv" style="grid-template-columns:180px 1fr;font-size:13px">
          <dt>Version</dt><dd>${esc(info.launcherVersion || '')}</dd>
          <dt>Edition</dt><dd>${isWin() ? 'Windows: installs .exe games only' : 'Debian / Ubuntu: installs .deb games only'}</dd>
          <dt>Games available</dt><dd>${games().length}</dd>
          <dt>Catalogue</dt><dd>${esc({ live: 'Live from shoukugames.org', cache: 'Saved copy from shoukugames.org', bundled: 'Bundled with the launcher' }[state.catalog.source] || '')}${state.catalog.fetchedAt ? ` · ${esc(new Date(state.catalog.fetchedAt).toLocaleString())}` : ''}</dd>
          <dt>Gameplay videos</dt><dd>20-second clips made from each game's real screenshots</dd>
        </dl>
        <label class="check" style="margin-top:14px"><input type="checkbox" id="set-autoplay" ${state.lib.settings.autoplayVideos !== false ? 'checked' : ''}> Play gameplay videos automatically on game pages</label>
        <div style="display:flex;gap:10px;margin-top:12px"><button class="btn btn--install" data-act="refresh">Check for new games</button><button class="btn btn--ghost" data-go="bug">${ICON.bug} Report a bug</button></div>
      </div>
    </div></div>`;
  $('#set-autoplay').addEventListener('change', async (e) => {
    state.lib.settings = await api.setSettings({ autoplayVideos: e.target.checked });
  });
}

// ------------------------------------------------------------------ events

async function refresh() {
  const btn = $('#btn-refresh');
  if (btn.classList.contains('is-spinning')) return;
  btn.classList.add('is-spinning');
  try {
    await api.refreshCatalog();
    toast(`Up to date: ${games().length} games from shoukugames.org.`, 'ok');
  } catch (e) {
    toast(`Could not reach shoukugames.org: ${e.message}`, 'error');
  } finally {
    btn.classList.remove('is-spinning');
  }
}

async function doAction(act, slug, el) {
  switch (act) {
    case 'install':
    case 'retry':
      closeMenus();
      if (act === 'retry') await api.cancel(slug).catch(() => {});
      return attempt(() => api.install(slug));
    case 'cancel': return attempt(() => api.cancel(slug));
    case 'play':
      try { await api.play(slug); } catch (e) {
        if (e.code === 'NO_EXE') {
          toast(`${e.message} Please choose it.`, 'error');
          await attempt(() => api.locate(slug));
        } else toast(e.message, 'error');
      }
      return undefined;
    case 'stop': return attempt(() => api.stop(slug));
    case 'uninstall': closeMenus(); return attempt(() => api.uninstall(slug));
    case 'locate': closeMenus(); return attempt(() => api.locate(slug));
    case 'folder': closeMenus(); return attempt(() => api.openFolder(slug));
    case 'menu': return el.parentElement.querySelector('.menu') ? closeMenus() : openMenu(el, slug);
    case 'refresh': return refresh();
    default: return undefined;
  }
}

document.addEventListener('click', (e) => {
  const t = e.target;
  if (!t.closest('.menu') && !t.closest('[data-act="menu"]')) closeMenus();

  const ext = t.closest('[data-ext]');
  if (ext) { e.preventDefault(); api.openExternal(ext.dataset.ext); return; }
  const act = t.closest('[data-act]');
  if (act) { e.preventDefault(); e.stopPropagation(); doAction(act.dataset.act, act.dataset.slug, act); return; }
  const nav = t.closest('[data-go]');
  if (nav) {
    e.preventDefault();
    const r = { view: nav.dataset.go };
    if (nav.dataset.slug !== undefined) r.slug = nav.dataset.slug;
    if (r.view === 'store') state.storeQuery = '';
    go(r);
    return;
  }
  const cat = t.closest('[data-cat]');
  if (cat) { e.preventDefault(); state.storeQuery = ''; go({ view: 'store', cat: cat.dataset.cat === state.route.cat ? undefined : cat.dataset.cat }); return; }
  const tab = t.closest('[data-store-tab]');
  if (tab) {
    e.preventDefault();
    state.storeTab = tab.dataset.storeTab;
    $$('.tabs [data-store-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.storeTab === state.storeTab));
    renderStoreRows();
    $('.tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const lib = t.closest('[data-lib]');
  if (lib) { go({ view: 'library', slug: lib.dataset.lib }); return; }
  const game = t.closest('[data-game]');
  if (game) { go({ view: 'game', slug: game.dataset.game }); return; }
  const lbx = t.closest('[data-lb]');
  if (lbx || t.id === 'lightbox') {
    const a = lbx ? lbx.dataset.lb : 'close';
    if (a === 'close') $('#lightbox').hidden = true;
    else lightboxStep(a === 'next' ? 1 : -1);
  }
});

document.addEventListener('keydown', (e) => {
  if (!$('#lightbox').hidden) {
    if (e.key === 'Escape') $('#lightbox').hidden = true;
    if (e.key === 'ArrowRight') lightboxStep(1);
    if (e.key === 'ArrowLeft') lightboxStep(-1);
    return;
  }
  if (e.key === 'Escape') closeMenus();
  if (e.altKey && e.key === 'ArrowLeft') goBack();
  if (e.altKey && e.key === 'ArrowRight') goFwd();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') { e.preventDefault(); refresh(); }
});
document.addEventListener('mouseup', (e) => { if (e.button === 3) goBack(); if (e.button === 4) goFwd(); });

$('#nav-back').addEventListener('click', goBack);
$('#nav-fwd').addEventListener('click', goFwd);
$('#btn-refresh').addEventListener('click', refresh);
$('#win-min').addEventListener('click', () => api.window.minimize());
$('#win-max').addEventListener('click', () => api.window.maximize());
$('#win-close').addEventListener('click', () => api.window.close());
$('.titlebar').addEventListener('dblclick', (e) => { if (!e.target.closest('button, a')) api.window.maximize(); });

// ------------------------------------------------------------------ boot

(async function boot() {
  const [catalog, lib] = await Promise.all([api.getCatalog(), api.getLibrary()]);
  state.catalog = catalog;
  state.lib = lib;
  $('#platform-pill').innerHTML = isWin() ? `${ICON.windows} Windows · .exe` : `${ICON.linux} Debian/Ubuntu · .deb`;
  api.systemInfo().then((i) => { state.sysInfo = i; }).catch(() => {});
  render();

  api.onLibrary((snap) => { state.lib = snap; updateDynamic(); });
  api.onCatalog((c) => {
    const before = games().map((g) => g.slug + g.version).join();
    state.catalog = c;
    const after = games().map((g) => g.slug + g.version).join();
    // Only redraw pages that list games, and only when the list really changed.
    if (before !== after && ['store', 'library', 'downloads'].includes(state.route.view)) render();
    else renderStatusbar();
  });
  api.onNotice((n) => {
    if (n.type === 'installed') toast(`${n.title} is ready to play!`, 'ok');
    else if (n.type === 'error') toast(n.message, 'error');
    else if (n.type === 'offline') { toast(n.message); renderStatusbar(); }
  });
})();
