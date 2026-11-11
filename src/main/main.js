'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog, Notification, nativeImage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const log = require('./logger');
const { fetchCatalog, filterForPlatform, SITE } = require('./scraper');
const { Library, PLATFORM } = require('./library');
const pkg = require('../../package.json');

const LAUNCHER_REPO = 'https://github.com/shoukugames/shoukulauncher';
const STUDIO_EMAIL = 'info@shoukugames.org';
const ROOT = path.join(__dirname, '..', '..');

app.setName('Shouku Launcher');
if (process.platform === 'win32') app.setAppUserModelId('org.shoukugames.launcher');
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let library = null;
let contentDir = null;
let catalog = { games: [], platform: PLATFORM };
let catalogSource = 'bundled';

// ------------------------------------------------------------------ catalogue

function findContentDir() {
  // Packaged apps use their own bundled content. From source, prefer the full catalogue in
  // build/content (build/stage holds whichever platform was staged last).
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'content')]
    : [path.join(ROOT, 'build', 'content'), path.join(ROOT, 'build', 'stage', 'content')];
  return candidates.find((d) => fs.existsSync(path.join(d, 'catalog.json'))) || null;
}

/** Turns relative media paths into URLs the renderer can load. */
function withMedia(games) {
  const base = contentDir ? pathToFileURL(contentDir).href.replace(/\/?$/, '/') : null;
  const local = (rel) => (base && rel && fs.existsSync(path.join(contentDir, rel)) ? base + rel : null);
  return games.map((g) => ({
    ...g,
    screenshots: (g.screenshots || []).map((s) => ({ ...s, src: local(s.local) || s.full, thumbSrc: local(s.localThumb) || s.thumb })),
    videoSrc: g.video ? local(g.video.file) : null,
  }));
}

function loadBundledCatalog() {
  contentDir = findContentDir();
  if (!contentDir) {
    log.warn('No bundled content found. Run "npm run content".');
    return { games: [] };
  }
  return JSON.parse(fs.readFileSync(path.join(contentDir, 'catalog.json'), 'utf8'));
}

/** Merges a live catalogue with bundled media so screenshots and videos still load offline. */
function mergeLive(live, bundled) {
  const old = new Map(bundled.games.map((g) => [g.slug, g]));
  for (const g of live.games) {
    const b = old.get(g.slug);
    if (!b) continue;
    const byUrl = new Map((b.screenshots || []).map((s) => [s.full, s]));
    g.screenshots = g.screenshots.map((s) => {
      const m = byUrl.get(s.full);
      return m ? { ...s, local: m.local, localThumb: m.localThumb } : s;
    });
    if (b.video) g.video = b.video;
  }
  return live;
}

function publishCatalog(raw, source) {
  const filtered = filterForPlatform(raw.games ? raw : { games: [] }, PLATFORM);
  catalog = { ...filtered, games: withMedia(filtered.games) };
  catalogSource = source;
  library.setCatalog(catalog.games);
  if (win) win.webContents.send('catalog', publicCatalog());
}

function publicCatalog() {
  return { platform: PLATFORM, source: catalogSource, fetchedAt: catalog.fetchedAt, site: SITE, games: catalog.games };
}

async function refreshCatalog() {
  const bundled = loadBundledCatalog();
  const live = await fetchCatalog({ sniff: PLATFORM === 'windows' });
  const merged = mergeLive(live, bundled);
  fs.writeFileSync(path.join(app.getPath('userData'), 'catalog-cache.json'), JSON.stringify(merged));
  publishCatalog(merged, 'live');
  await library.detect();
  log.info(`Catalogue refreshed: ${catalog.games.length} games for ${PLATFORM}`);
  return publicCatalog();
}

// ------------------------------------------------------------------ window

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#0b2238',
    title: 'Shouku Launcher',
    icon: nativeImage.createFromPath(path.join(__dirname, '..', 'renderer', 'img', 'icon-128.png')),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => win.webContents.send('window-state', { maximized: true }));
  win.on('unmaximize', () => win.webContents.send('window-state', { maximized: false }));
  // Never navigate the launcher itself; open web links in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault();
      openExternal(url);
    }
  });
}

function openExternal(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'mailto:') return shell.openExternal(url);
  } catch {
    /* ignore */
  }
  log.warn('Blocked external URL', url);
  return null;
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, icon: path.join(__dirname, '..', 'renderer', 'img', 'icon-128.png') }).show();
}

// ------------------------------------------------------------------ system info / bug reports

function systemInfo() {
  return {
    launcherVersion: pkg.version,
    platform: PLATFORM,
    os: `${os.type()} ${os.release()} (${process.arch})`,
    osVersion: typeof os.version === 'function' ? os.version() : '',
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    locale: app.getLocale(),
    memory: `${Math.round(os.totalmem() / 1073741824)} GB`,
    cpu: (os.cpus()[0] || {}).model || 'unknown',
    catalogSource,
    catalogFetchedAt: catalog.fetchedAt,
  };
}

function bugReportsDir() {
  const d = path.join(app.getPath('userData'), 'bug-reports');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function issueTarget(report) {
  const game = report.slug && catalog.games.find((g) => g.slug === report.slug);
  return game && game.github ? game.github : LAUNCHER_REPO;
}

// ------------------------------------------------------------------ IPC

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (err) {
      log.error(`${channel} failed:`, err);
      return { ok: false, error: err.message, code: err.code };
    }
  });
}

function registerIpc() {
  handle('catalog:get', () => publicCatalog());
  handle('catalog:refresh', () => refreshCatalog());
  handle('library:get', () => library.snapshot());
  handle('library:install', (slug) => library.install(slug));
  handle('library:cancel', (slug) => library.cancel(slug));
  handle('library:uninstall', async (slug) => {
    const g = catalog.games.find((x) => x.slug === slug);
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Uninstall', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Uninstall',
      message: `Uninstall ${g ? g.title : slug}?`,
      detail: 'Your play time is kept. You can install the game again at any time.',
    });
    if (response === 0) await library.uninstall(slug);
    return response === 0;
  });
  handle('library:play', (slug) => library.play(slug));
  handle('library:stop', (slug) => library.stop(slug));
  handle('library:locate', async (slug) => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Find the game',
      properties: ['openFile'],
      filters: PLATFORM === 'windows' ? [{ name: 'Windows program', extensions: ['exe'] }] : [],
    });
    if (r.canceled || !r.filePaths[0]) return false;
    library.setExe(slug, r.filePaths[0]);
    return true;
  });
  handle('library:open-folder', (slug) => {
    const dir = library.installLocation(slug);
    if (dir && fs.existsSync(dir)) return shell.openPath(dir);
    throw new Error('The install folder could not be found.');
  });
  handle('settings:set', (patch) => {
    Object.assign(library.state.settings, patch || {});
    library.save();
    return library.state.settings;
  });
  handle('open-external', (url) => openExternal(url));
  handle('system:info', () => systemInfo());
  handle('system:log', () => log.tail(60));
  handle('bug:issue-url', (report) => {
    const repo = issueTarget(report);
    const title = `[Bug] ${report.title}`.slice(0, 200);
    let body = report.markdown;
    // Keep the URL a sensible length; the full report can be attached from the saved file.
    if (body.length > 6000) body = body.slice(0, 6000) + '\n\n_(Report shortened. The full report was saved by the launcher.)_';
    return `${repo}/issues/new?labels=bug&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  });
  handle('bug:email', (report) => {
    const body = report.markdown.length > 1800 ? report.markdown.slice(0, 1800) + '\n\n(Shortened. Please attach the saved report.)' : report.markdown;
    return shell.openExternal(`mailto:${STUDIO_EMAIL}?subject=${encodeURIComponent(`[Bug] ${report.title}`)}&body=${encodeURIComponent(body)}`);
  });
  handle('bug:save', async (report, askWhere) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `bug-${(report.slug || 'launcher').replace(/[^a-z0-9-]/gi, '')}-${stamp}.md`;
    const keep = path.join(bugReportsDir(), name);
    fs.writeFileSync(keep, report.markdown);
    if (!askWhere) return keep;
    const r = await dialog.showSaveDialog(win, { title: 'Save bug report', defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: 'Markdown', extensions: ['md'] }] });
    if (r.canceled || !r.filePath) return keep;
    fs.writeFileSync(r.filePath, report.markdown);
    return r.filePath;
  });
  handle('bug:history', () =>
    fs
      .readdirSync(bugReportsDir())
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, 20)
      .map((f) => ({ file: f, title: (fs.readFileSync(path.join(bugReportsDir(), f), 'utf8').match(/^# (.+)$/m) || [])[1] || f })),
  );
  handle('bug:open-folder', () => shell.openPath(bugReportsDir()));

  ipcMain.on('window:minimize', () => win && win.minimize());
  ipcMain.on('window:maximize', () => win && (win.isMaximized() ? win.unmaximize() : win.maximize()));
  ipcMain.on('window:close', () => win && win.close());
}

// ------------------------------------------------------------------ start

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  log.init(path.join(userData, 'logs'));
  log.info(`Shouku Launcher ${pkg.version} on ${PLATFORM} (${os.type()} ${os.release()})`);

  const gamesDir =
    PLATFORM === 'windows' ? path.join(process.env.LOCALAPPDATA || userData, 'ShoukuGames', 'Library') : path.join(userData, 'games');
  library = new Library({ dataDir: userData, gamesDir });
  library.on('changed', (snap) => win && win.webContents.send('library', snap));
  library.on('notice', (n) => {
    if (n.type === 'installed') notify('Ready to play', `${n.title} is installed.`);
    if (win) win.webContents.send('notice', n);
  });

  // Start from the bundled catalogue (or the last live one), then refresh in the background.
  const bundled = loadBundledCatalog();
  let start = bundled;
  let source = 'bundled';
  try {
    const cached = JSON.parse(fs.readFileSync(path.join(userData, 'catalog-cache.json'), 'utf8'));
    if (cached.games && cached.games.length) {
      start = mergeLive(cached, bundled);
      source = 'cache';
    }
  } catch {
    /* no cache yet */
  }
  publishCatalog(start, source);
  registerIpc();
  createWindow();
  library.detect().catch((e) => log.warn('detect failed', e));

  setTimeout(() => {
    refreshCatalog().catch((e) => {
      log.warn('Live refresh failed (offline?):', e.message);
      if (win) win.webContents.send('notice', { type: 'offline', message: 'Offline: showing the games bundled with the launcher.' });
    });
  }, 4000);
});

app.on('window-all-closed', () => app.quit());
