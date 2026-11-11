'use strict';
const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw Object.assign(new Error(r.error), { code: r.code });
  return r.value;
}

const on = (channel) => (fn) => {
  const listener = (_e, data) => fn(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('shouku', {
  getCatalog: () => call('catalog:get'),
  refreshCatalog: () => call('catalog:refresh'),
  getLibrary: () => call('library:get'),
  install: (slug) => call('library:install', slug),
  cancel: (slug) => call('library:cancel', slug),
  uninstall: (slug) => call('library:uninstall', slug),
  play: (slug) => call('library:play', slug),
  stop: (slug) => call('library:stop', slug),
  locate: (slug) => call('library:locate', slug),
  openFolder: (slug) => call('library:open-folder', slug),
  setSettings: (patch) => call('settings:set', patch),
  openExternal: (url) => call('open-external', url),
  systemInfo: () => call('system:info'),
  logTail: () => call('system:log'),
  bug: {
    issueUrl: (report) => call('bug:issue-url', report),
    email: (report) => call('bug:email', report),
    save: (report, askWhere) => call('bug:save', report, askWhere),
    history: () => call('bug:history'),
    openFolder: () => call('bug:open-folder'),
  },
  onCatalog: on('catalog'),
  onLibrary: on('library'),
  onNotice: on('notice'),
  onWindowState: on('window-state'),
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
});
