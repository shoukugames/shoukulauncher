'use strict';
const fs = require('fs');
const path = require('path');

let file = null;
const MAX = 1024 * 1024;

function init(dir) {
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'launcher.log');
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > MAX) fs.renameSync(file, file + '.1');
  } catch {
    /* ignore */
  }
}

function write(level, args) {
  const line = `${new Date().toISOString()} [${level}] ${args
    .map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')}\n`;
  if (level === 'error') process.stderr.write(line);
  else process.stdout.write(line);
  if (file) {
    try {
      fs.appendFileSync(file, line);
    } catch {
      /* ignore */
    }
  }
}

function tail(lines = 80) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').slice(-lines - 1).join('\n');
  } catch {
    return '';
  }
}

module.exports = {
  init,
  tail,
  get file() {
    return file;
  },
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => write('error', a),
};
