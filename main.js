const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const DEFAULT_SCHEDULE = require('./schedule-seed');

// Collapsed window = just the pet. The renderer asks for a bigger size when the bubble opens.
const COLLAPSED_W = 186;
const COLLAPSED_H = 176;
const HIDE_MS = 30 * 60 * 1000; // right-click "Hide" brings the pet back after this long

let win = null;
let tray = null;
let dragStart = null;
let anchor = null; // screen position of the pet's bottom-right corner
let unhideTimer = null;
let store = { days: {}, tasks: [], anchor: null };

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ---------- storage ----------
function storePath() {
  return path.join(app.getPath('userData'), 'promises.json');
}
function loadStore() {
  try {
    store = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    store.days = store.days || {};
    store.tasks = Array.isArray(store.tasks) ? store.tasks : [];
  } catch (e) {
    store = { days: {}, tasks: [], anchor: null };
  }
  // first run with the schedule feature: start from the seeded exam dates
  if (!Array.isArray(store.schedule)) store.schedule = DEFAULT_SCHEDULE.map((r) => ({ id: newId(), ...r }));
}
function saveStore() {
  try {
    fs.mkdirSync(path.dirname(storePath()), { recursive: true });
    fs.writeFileSync(storePath(), JSON.stringify(store, null, 2));
  } catch (e) {
    console.error('save failed', e);
  }
}
function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateKey(d);
}
function getState() {
  const date = dateKey();
  const today = store.days[date] || [];
  const prev = (store.days[yesterdayKey()] || []).filter((p) => !p.done);
  const alreadyCarried = new Set(today.map((p) => p.text.toLowerCase()));
  const carry = prev.filter((p) => !alreadyCarried.has(p.text.toLowerCase()));
  return { date, today, carryCount: carry.length, tasks: store.tasks, schedule: store.schedule };
}
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function prune() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const ck = dateKey(cutoff);
  for (const k of Object.keys(store.days)) if (k < ck) delete store.days[k];
}

// ---------- window placement ----------
function defaultAnchor() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { right: wa.x + wa.width - 20, bottom: wa.y + wa.height - 10 };
}
function validAnchor(a) {
  if (!a || !Number.isFinite(a.right) || !Number.isFinite(a.bottom)) return false;
  return screen.getAllDisplays().some((d) => {
    const b = d.workArea;
    return a.right - 20 > b.x && a.right - 20 < b.x + b.width && a.bottom - 20 > b.y && a.bottom - 20 < b.y + b.height;
  });
}
// Keep the pet's bottom-right corner fixed; the window grows up and to the left.
function placeWindow(w, h) {
  if (!win || !anchor) return;
  const wa = screen.getDisplayNearestPoint({ x: anchor.right - 20, y: anchor.bottom - 20 }).workArea;
  let x = anchor.right - w;
  let y = anchor.bottom - h;
  x = Math.min(Math.max(x, wa.x), wa.x + wa.width - w);
  y = Math.max(y, wa.y);
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
}

function createWindow() {
  anchor = validAnchor(store.anchor) ? store.anchor : defaultAnchor();
  win = new BrowserWindow({
    x: Math.round(anchor.right - COLLAPSED_W),
    y: Math.round(anchor.bottom - COLLAPSED_H),
    width: COLLAPSED_W,
    height: COLLAPSED_H,
    transparent: true,
    frame: false,
    resizable: process.platform === 'linux', // other platforms can still resize from code
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.on('preload-error', (_e, p, err) => console.error('preload error:', p, err));
  win.loadFile('index.html');
  // keep the tray's Hide/Show label in sync however the window gets shown or hidden
  win.on('show', () => {
    clearTimeout(unhideTimer);
    unhideTimer = null;
    refreshTrayMenu();
  });
  win.on('hide', refreshTrayMenu);
  win.on('closed', () => (win = null));
}

function refreshTrayMenu() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: win && win.isVisible() ? 'Hide pet' : 'Show pet',
      click: () => {
        if (!win) return;
        win.isVisible() ? win.hide() : win.show();
      }
    },
    {
      label: 'Open promises',
      click: () => {
        if (win) {
          win.show();
          win.webContents.send('open-bubble');
        }
      }
    },
    {
      label: 'Reset position',
      click: () => {
        if (!win) return;
        anchor = defaultAnchor();
        store.anchor = anchor;
        saveStore();
        const b = win.getBounds();
        placeWindow(b.width, b.height);
      }
    },
    {
      label: 'Launch at login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
    },
    { label: 'Developer tools (debug)', click: () => win && win.webContents.openDevTools({ mode: 'detach' }) },
    { type: 'separator' },
    { label: 'Quit Promise Pet', click: () => app.quit() }
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip('Promise Pet');
  refreshTrayMenu();
  tray.on('click', () => {
    if (!win) return;
    win.show();
    win.webContents.send('open-bubble');
  });
}

// ---------- IPC ----------
ipcMain.handle('state:get', () => getState());

ipcMain.handle('promise:add', (_e, text) => {
  const t = String(text || '').trim().slice(0, 140);
  if (!t) return getState();
  const k = dateKey();
  store.days[k] = store.days[k] || [];
  store.days[k].push({ id: newId(), text: t, done: false });
  saveStore();
  return getState();
});

ipcMain.handle('promise:toggle', (_e, id) => {
  const list = store.days[dateKey()] || [];
  const p = list.find((x) => x.id === id);
  if (p) {
    p.done = !p.done;
    p.doneAt = p.done ? Date.now() : null;
    saveStore();
  }
  return getState();
});

ipcMain.handle('promise:remove', (_e, id) => {
  const k = dateKey();
  store.days[k] = (store.days[k] || []).filter((x) => x.id !== id);
  saveStore();
  return getState();
});

ipcMain.handle('promise:edit', (_e, id, text) => {
  const t = String(text || '').trim().slice(0, 140);
  const p = (store.days[dateKey()] || []).find((x) => x.id === id);
  if (p && t) {
    p.text = t;
    saveStore();
  }
  return getState();
});

// ----- backlog: open-ended to-dos, no dates, never reset or pruned -----
ipcMain.handle('task:add', (_e, text) => {
  const t = String(text || '').trim().slice(0, 200);
  if (t) {
    store.tasks.push({ id: newId(), text: t, done: false, createdAt: Date.now() });
    saveStore();
  }
  return getState();
});

ipcMain.handle('task:toggle', (_e, id) => {
  const t = store.tasks.find((x) => x.id === id);
  if (t) {
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    saveStore();
  }
  return getState();
});

ipcMain.handle('task:edit', (_e, id, text) => {
  const v = String(text || '').trim().slice(0, 200);
  const t = store.tasks.find((x) => x.id === id);
  if (t && v) {
    t.text = v;
    saveStore();
  }
  return getState();
});

ipcMain.handle('task:remove', (_e, id) => {
  store.tasks = store.tasks.filter((x) => x.id !== id);
  saveStore();
  return getState();
});

ipcMain.handle('task:clearDone', () => {
  store.tasks = store.tasks.filter((x) => !x.done);
  saveStore();
  return getState();
});

// move a backlog item into today's promises
ipcMain.handle('task:promote', (_e, id) => {
  const t = store.tasks.find((x) => x.id === id);
  if (t && !t.done) {
    const k = dateKey();
    store.days[k] = store.days[k] || [];
    store.days[k].push({ id: newId(), text: t.text, done: false });
    store.tasks = store.tasks.filter((x) => x.id !== id);
    saveStore();
  }
  return getState();
});

// ----- schedule: editable table of exams, tests and deadlines -----
const SCHEDULE_LIMITS = { module: 40, what: 200, time: 120, venue: 120, notes: 1000 };
function cleanSchedulePatch(patch) {
  const out = {};
  if (!patch || typeof patch !== 'object') return out;
  if ('date' in patch) {
    const d = String(patch.date || '');
    out.date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
  }
  for (const [k, max] of Object.entries(SCHEDULE_LIMITS)) {
    if (k in patch) out[k] = String(patch[k] || '').trim().slice(0, max);
  }
  return out;
}

ipcMain.handle('schedule:add', () => {
  store.schedule.push({ id: newId(), date: '', module: '', what: '', time: '', venue: '', notes: '' });
  saveStore();
  return getState();
});

ipcMain.handle('schedule:update', (_e, id, patch) => {
  const r = store.schedule.find((x) => x.id === id);
  if (r) {
    Object.assign(r, cleanSchedulePatch(patch));
    saveStore();
  }
  return getState();
});

ipcMain.handle('schedule:remove', (_e, id) => {
  store.schedule = store.schedule.filter((x) => x.id !== id);
  saveStore();
  return getState();
});

ipcMain.handle('promise:carry', () => {
  const k = dateKey();
  store.days[k] = store.days[k] || [];
  const have = new Set(store.days[k].map((p) => p.text.toLowerCase()));
  for (const p of store.days[yesterdayKey()] || []) {
    if (!p.done && !have.has(p.text.toLowerCase())) {
      store.days[k].push({ id: newId(), text: p.text, done: false });
    }
  }
  saveStore();
  return getState();
});

ipcMain.on('win:resize', (_e, size) => {
  if (!size || !Number.isFinite(size.w) || !Number.isFinite(size.h)) return;
  placeWindow(size.w, size.h);
});

// room available above and to the left of the pet, so the big schedule view fits on screen
ipcMain.handle('win:space', () => {
  const a = anchor || defaultAnchor();
  const wa = screen.getDisplayNearestPoint({ x: a.right - 20, y: a.bottom - 20 }).workArea;
  return { w: a.right - wa.x, h: a.bottom - wa.y };
});

ipcMain.on('drag:start', () => {
  if (!win) return;
  const [x, y] = win.getPosition();
  dragStart = { x, y };
});
ipcMain.on('drag:move', (_e, d) => {
  if (!win || !dragStart) return;
  win.setPosition(Math.round(dragStart.x + d.dx), Math.round(dragStart.y + d.dy));
});
ipcMain.on('drag:end', () => {
  if (!win || !dragStart) return;
  const b = win.getBounds();
  anchor = { right: b.x + b.width, bottom: b.y + b.height };
  store.anchor = anchor;
  saveStore();
  dragStart = null;
});

ipcMain.on('app:quit', () => app.quit());

// hide for a while, then come back without stealing focus; showing it earlier cancels the timer
function hideForAWhile() {
  if (!win) return;
  win.hide();
  clearTimeout(unhideTimer);
  unhideTimer = setTimeout(() => win && win.showInactive(), HIDE_MS);
}

// right-click menu on the pet itself
ipcMain.on('pet:menu', () => {
  if (!win) return;
  Menu.buildFromTemplate([
    { label: 'Hide for 30 minutes', click: hideForAWhile },
    { type: 'separator' },
    { label: 'Quit Promise Pet', click: () => app.quit() }
  ]).popup({ window: win });
});

// ---------- lifecycle ----------
app.on('second-instance', () => {
  if (win) {
    win.show();
    win.webContents.send('open-bubble');
  }
});

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  loadStore();
  prune();
  saveStore();
  createWindow();
  createTray();
});

app.on('window-all-closed', () => app.quit());
