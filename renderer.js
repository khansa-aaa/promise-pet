// The bridge from main.js lives on window.promisePet. (It must not be called "pet": the
// `const pet` element below would clash with it and stop this whole script from loading.)
const api = window.promisePet;
if (!api) {
  document.body.style.cssText = 'font:12px sans-serif;color:#fff;background:#b33;padding:8px;user-select:text';
  document.body.textContent = 'Preload failed. Start with "npm start" and check the terminal.';
  throw new Error('window.promisePet is missing (preload did not load)');
}

const $ = (id) => document.getElementById(id);
const bubble = $('bubble');
const list = $('list');
const pet = $('pet');
const petWrap = $('pet-wrap');
const badge = $('badge');
const zzz = $('zzz');
const confetti = $('confetti');
const msg = $('bubble-msg');
const title = $('bubble-title');
const carryBtn = $('carry');
const addForm = $('add-form');
const addInput = $('add-input');
// backlog tab
const tabToday = $('tab-today');
const tabTasks = $('tab-tasks');
const viewToday = $('view-today');
const viewTasks = $('view-tasks');
const tasksCount = $('tasks-count');
const tasksMsg = $('tasks-msg');
const taskList = $('tasklist');
const clearDoneBtn = $('clear-done');
const taskForm = $('task-form');
const taskInput = $('task-input');
// schedule tab
const tabSched = $('tab-sched');
const viewSched = $('view-sched');
const schedMsg = $('sched-msg');
const schedWrap = $('sched-wrap');
const schedBody = $('sched-body');
const schedAdd = $('sched-add');
const schedHidePast = $('sched-hide-past');

const NUDGE_EVERY_MS = 45 * 60 * 1000; // remind about pending promises
const ASK_EVERY_MS = 30 * 60 * 1000; // re-ask if no promises yet
const AUTO_HIDE_MS = 14 * 1000;
const SCHED_MAX_W = 980; // the schedule view grows up to this, limited by the space left of the pet
const SCHED_MAX_H = 640;

let state = { date: '', today: [], carryCount: 0, tasks: [], schedule: [] };
let tab = 'today'; // 'today' | 'tasks' | 'schedule'
let hideTimer = null;
let clickTimer = null;
let lastNudge = Date.now();
let moodOverride = null;
let editing = false;
let lastW = 0;
let lastH = 0;

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const pending = () => state.today.filter((p) => !p.done);
const isNight = () => {
  const h = new Date().getHours();
  return h >= 23 || h < 6;
};
const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

// ---------- window size: just the pet, plus the bubble when it is open ----------
function syncSize() {
  const open = !bubble.classList.contains('hidden');
  const baseW = petWrap.offsetWidth + 16;
  const baseH = petWrap.offsetHeight + 12;
  const w = open ? Math.max(baseW, 340, bubble.offsetWidth + 16) : baseW;
  const h = open ? baseH + 6 + bubble.offsetHeight : baseH;
  if (w !== lastW || h !== lastH) {
    lastW = w;
    lastH = h;
    api.resize(w, h);
  }
}
new ResizeObserver(syncSize).observe(bubble);

// ---------- rendering ----------
const MOODS = ['mood-ask', 'mood-idle', 'mood-nudge', 'mood-happy', 'mood-sleep'];
function setMood(m) {
  pet.classList.remove(...MOODS);
  pet.classList.add('mood-' + m);
  zzz.classList.toggle('hidden', m !== 'sleep');
}

function currentMood() {
  if (moodOverride) return moodOverride;
  const total = state.today.length;
  const left = pending().length;
  if (total === 0) return isNight() ? 'sleep' : 'ask';
  if (left === 0) return 'happy';
  return isNight() ? 'sleep' : 'idle';
}

// saveFn(id, text) returns the new state; defaults to editing a daily promise
function startEdit(li, p, saveFn = (id, v) => api.edit(id, v)) {
  if (editing) return;
  editing = true;
  const txt = li.querySelector('.txt');
  const input = document.createElement('input');
  input.className = 'edit-input';
  input.type = 'text';
  input.maxLength = 140;
  input.value = p.text;
  txt.replaceWith(input);
  li.querySelectorAll('.ed, .rm, .up').forEach((b) => b.classList.add('hidden'));
  input.focus();
  input.select();
  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;
    const v = input.value.trim();
    if (save && v && v !== p.text) state = await saveFn(p.id, v);
    editing = false;
    render();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

function render() {
  if (editing) return;
  const total = state.today.length;
  const left = pending().length;
  const done = total - left;

  badge.textContent = left;
  badge.classList.toggle('hidden', left === 0);

  list.textContent = '';
  for (const p of state.today) {
    const li = document.createElement('li');
    if (p.done) li.classList.add('done');
    const check = document.createElement('span');
    check.className = 'check';
    const txt = document.createElement('span');
    txt.className = 'txt';
    txt.textContent = p.text;
    txt.title = 'Click to mark done · double-click to edit';
    const ed = document.createElement('button');
    ed.className = 'ed';
    ed.textContent = '✎';
    ed.title = 'Edit';
    const rm = document.createElement('button');
    rm.className = 'rm';
    rm.textContent = '✕';
    rm.title = 'Remove';

    check.onclick = () => onToggle(p.id);
    // single click toggles after a short delay so a double-click can edit instead
    txt.onclick = () => {
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => onToggle(p.id), 220);
    };
    txt.ondblclick = () => {
      clearTimeout(clickTimer);
      startEdit(li, p);
    };
    ed.onclick = () => startEdit(li, p);
    rm.onclick = async () => {
      state = await api.remove(p.id);
      render();
    };
    li.append(check, txt, ed, rm);
    list.append(li);
  }

  if (total === 0) {
    title.textContent = 'Today’s promises';
    msg.textContent = `${greeting()}! What do you promise to do today?`;
    addInput.placeholder = 'I promise to…';
  } else if (left === 0) {
    title.textContent = `All kept · ${done}/${total}`;
    msg.textContent = 'Every promise kept today. I’m so proud of you!';
    addInput.placeholder = 'Add another promise…';
  } else {
    title.textContent = `Today’s promises · ${done}/${total}`;
    msg.textContent = left === 1 ? 'Just one left. You’ve got this!' : `${left} still to keep. One at a time!`;
    addInput.placeholder = 'Add another promise…';
  }

  if (total === 0 && state.carryCount > 0) {
    carryBtn.textContent = `Carry over ${state.carryCount} unfinished from yesterday`;
    carryBtn.classList.remove('hidden');
  } else {
    carryBtn.classList.add('hidden');
  }

  renderTasks();
  renderSchedule();
  setMood(currentMood());
  syncSize();
}

// ---------- backlog: open-ended to-dos with no dates ----------
function showTab(t) {
  tab = t;
  tabToday.classList.toggle('active', t === 'today');
  tabTasks.classList.toggle('active', t === 'tasks');
  tabSched.classList.toggle('active', t === 'schedule');
  viewToday.classList.toggle('hidden', t !== 'today');
  viewTasks.classList.toggle('hidden', t !== 'tasks');
  viewSched.classList.toggle('hidden', t !== 'schedule');
  clearTimeout(hideTimer); // never auto-close while browsing the backlog
  sizeBubble();
  render();
  if (t === 'tasks') setTimeout(() => taskInput.focus(), 50);
}
tabToday.onclick = () => showTab('today');
tabTasks.onclick = () => showTab('tasks');
tabSched.onclick = () => showTab('schedule');

// Today and Backlog keep the small bubble; the schedule fills the room above and left of the pet.
async function sizeBubble() {
  if (tab !== 'schedule') {
    bubble.classList.remove('wide');
    return;
  }
  const space = await api.space();
  if (tab !== 'schedule') return;
  const petH = petWrap.offsetHeight + 12 + 6;
  const w = Math.max(420, Math.min(SCHED_MAX_W, space.w - 26));
  const h = Math.max(240, Math.min(SCHED_MAX_H, space.h - petH - 8));
  bubble.style.setProperty('--sched-w', w + 'px');
  bubble.style.setProperty('--sched-h', h + 'px');
  bubble.classList.add('wide');
  fitSchedule();
}

function renderTasks() {
  const tasks = state.tasks || [];
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  tasksCount.textContent = open.length ? `(${open.length})` : '';
  if (tab === 'tasks') title.textContent = 'Startup backlog';
  tasksMsg.textContent =
    tasks.length === 0
      ? 'Jot down anything you need to do for the startup. No dates, no pressure.'
      : `${open.length} open${done.length ? ` · ${done.length} done` : ''}`;

  taskList.textContent = '';
  for (const t of [...open, ...done]) {
    const li = document.createElement('li');
    if (t.done) li.classList.add('done');
    const check = document.createElement('span');
    check.className = 'check';
    const txt = document.createElement('span');
    txt.className = 'txt';
    txt.textContent = t.text;
    txt.title = 'Click to mark done · double-click to edit';
    const mk = (cls, label, tip) => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.title = tip;
      return b;
    };
    const up = mk('up', '→', 'Move to today’s promises');
    const ed = mk('ed', '✎', 'Edit');
    const rm = mk('rm', '✕', 'Remove');

    const toggle = async () => {
      state = await api.taskToggle(t.id);
      render();
      if (!t.done) playAnim('hop', 700);
    };
    check.onclick = toggle;
    txt.onclick = () => {
      clearTimeout(clickTimer);
      clickTimer = setTimeout(toggle, 220);
    };
    txt.ondblclick = () => {
      clearTimeout(clickTimer);
      startEdit(li, t, (id, v) => api.taskEdit(id, v));
    };
    ed.onclick = () => startEdit(li, t, (id, v) => api.taskEdit(id, v));
    up.onclick = async () => {
      state = await api.taskPromote(t.id);
      render();
      playAnim('hop', 700);
    };
    rm.onclick = async () => {
      state = await api.taskRemove(t.id);
      render();
    };
    li.append(check, txt, ...(t.done ? [] : [up]), ed, rm);
    taskList.append(li);
  }

  if (done.length) {
    clearDoneBtn.textContent = `Clear ${done.length} done`;
    clearDoneBtn.classList.remove('hidden');
  } else {
    clearDoneBtn.classList.add('hidden');
  }
}

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = taskInput.value.trim();
  if (!text) return;
  taskInput.value = '';
  state = await api.taskAdd(text);
  render();
});
clearDoneBtn.onclick = async () => {
  state = await api.taskClearDone();
  render();
};

// ---------- schedule: editable table of exams, tests and deadlines ----------
const SCHED_FIELDS = [
  ['module', 'e.g. MATH101'],
  ['what', 'Final exam, quiz…'],
  ['time', 'e.g. 9–11am'],
  ['venue', 'TBA'],
  ['notes', 'Scope, what to bring…']
];
let schedFocusId = null; // row to focus after "+ Add row"

function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function daysUntil(date) {
  if (!date || !state.date) return null;
  return Math.round((parseDay(date) - parseDay(state.date)) / 86400000);
}
function whenLabel(date) {
  const n = daysUntil(date);
  if (n === null) return 'Date TBA';
  const wd = parseDay(date).toLocaleDateString('en-GB', { weekday: 'short' });
  if (n === 0) return `${wd} · today`;
  if (n === 1) return `${wd} · tomorrow`;
  if (n > 1) return `${wd} · in ${n} days`;
  return `${wd} · past`;
}
// colour by urgency: red within 3 days, yellow within a week, green further out
function rowClass(tr, date) {
  const n = daysUntil(date);
  tr.classList.toggle('past', n !== null && n < 0);
  tr.classList.toggle('soon', n !== null && n >= 0 && n <= 3);
  tr.classList.toggle('week', n !== null && n > 3 && n <= 7);
  tr.classList.toggle('later', n !== null && n > 7);
}

function autosize(ta) {
  if (!ta.offsetParent) return; // not visible yet; fitSchedule() runs again when shown
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}
function fitSchedule() {
  if (tab === 'schedule' && !bubble.classList.contains('hidden')) schedBody.querySelectorAll('textarea').forEach(autosize);
}
const typingInSchedule = () => {
  const el = document.activeElement;
  return !!el && schedWrap.contains(el) && el.matches('input, textarea');
};

function schedRow(r) {
  const tr = document.createElement('tr');
  tr.dataset.id = r.id;
  rowClass(tr, r.date);
  const save = async (patch) => {
    Object.assign(r, patch); // keep the local copy current so a rebuild shows the new value
    state = await api.scheduleUpdate(r.id, patch);
  };

  const dateCell = document.createElement('td');
  const date = document.createElement('input');
  date.type = 'date';
  date.value = r.date || '';
  const when = document.createElement('div');
  when.className = 'when';
  when.textContent = whenLabel(r.date);
  // rows re-sort once focus leaves the table, so typing a date doesn't make the row jump
  date.addEventListener('change', () => {
    save({ date: date.value });
    when.textContent = whenLabel(date.value);
    rowClass(tr, date.value);
  });
  dateCell.append(date, when);
  tr.append(dateCell);

  for (const [field, placeholder] of SCHED_FIELDS) {
    const td = document.createElement('td');
    td.className = 'f-' + field;
    const ta = document.createElement('textarea');
    ta.rows = 1;
    ta.value = r[field] || '';
    ta.placeholder = placeholder;
    ta.spellcheck = field === 'what' || field === 'notes';
    ta.addEventListener('input', () => autosize(ta));
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Enter saves; Shift+Enter adds a line break
        ta.blur();
      } else if (e.key === 'Escape') {
        ta.value = r[field] || '';
        autosize(ta);
        ta.blur();
      }
    });
    ta.addEventListener('change', () => save({ [field]: ta.value.trim() }));
    td.append(ta);
    tr.append(td);
  }

  // two-step delete so a stray click can't wipe a row
  const rmCell = document.createElement('td');
  const rm = document.createElement('button');
  rm.className = 'sched-rm';
  rm.type = 'button';
  rm.textContent = '✕';
  rm.title = 'Delete row';
  let armed = null;
  rm.onclick = async () => {
    if (!armed) {
      rm.textContent = 'Sure?';
      rm.classList.add('armed');
      armed = setTimeout(() => {
        armed = null;
        rm.textContent = '✕';
        rm.classList.remove('armed');
      }, 2500);
      return;
    }
    clearTimeout(armed);
    state = await api.scheduleRemove(r.id);
    renderSchedule();
  };
  rmCell.append(rm);
  tr.append(rmCell);
  return tr;
}

function renderSchedule() {
  const rows = state.schedule || [];
  const upcoming = rows.filter((r) => !r.date || r.date >= state.date).length;
  if (tab === 'schedule') title.textContent = 'Exams, tests & deadlines';
  schedMsg.textContent = `${upcoming} upcoming · click any cell to edit`;
  if (typingInSchedule()) return; // don't rebuild the table under the cursor

  const shown = rows
    .filter((r) => !(schedHidePast.checked && r.date && r.date < state.date))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')); // undated rows last
  schedBody.textContent = '';
  if (!shown.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'sched-empty';
    td.textContent = rows.length ? 'Nothing upcoming. Untick "Hide past" to see everything.' : 'No dates yet. Click "+ Add row" to add one.';
    tr.append(td);
    schedBody.append(tr);
  }
  for (const r of shown) schedBody.append(schedRow(r));
  fitSchedule();

  if (schedFocusId) {
    const first = schedBody.querySelector(`tr[data-id="${schedFocusId}"] input`);
    schedFocusId = null;
    if (first) {
      first.focus();
      first.scrollIntoView({ block: 'nearest' });
    }
  }
}

schedWrap.addEventListener('focusout', () => {
  setTimeout(() => {
    if (!typingInSchedule()) renderSchedule();
  }, 0);
});
schedHidePast.onchange = () => renderSchedule();
schedAdd.onclick = async () => {
  state = await api.scheduleAdd();
  const rows = state.schedule || [];
  schedFocusId = rows.length ? rows[rows.length - 1].id : null;
  renderSchedule();
};

// ---------- bubble show/hide ----------
const autoHideAllowed = () => tab === 'today' && state.today.length > 0;
function openBubble({ autoHide = true } = {}) {
  bubble.classList.remove('hidden');
  clearTimeout(hideTimer);
  syncSize();
  if (tab === 'schedule') sizeBubble(); // the pet may have moved since the table was last open
  // when there are no promises yet, keep asking until the user answers or dismisses
  if (autoHide && autoHideAllowed()) {
    hideTimer = setTimeout(closeBubble, AUTO_HIDE_MS);
  }
}
function hideBubble() {
  bubble.classList.add('hidden');
  clearTimeout(hideTimer);
  syncSize();
}
function closeBubble() {
  if (editing) return;
  if ((document.activeElement === addInput && addInput.value.trim()) || (document.activeElement === taskInput && taskInput.value.trim())) return; // don't hide while typing
  hideBubble();
}
bubble.addEventListener('mouseenter', () => clearTimeout(hideTimer));
bubble.addEventListener('mouseleave', () => {
  if (autoHideAllowed() && !bubble.classList.contains('hidden')) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(closeBubble, AUTO_HIDE_MS);
  }
});
$('bubble-close').onclick = () => {
  hideBubble();
  lastNudge = Date.now();
};

// ---------- actions ----------
function playAnim(cls, ms) {
  pet.classList.remove('hop', 'dance');
  void pet.offsetWidth;
  pet.classList.add(cls);
  setTimeout(() => pet.classList.remove(cls), ms);
}

function burst() {
  const colors = ['#ffc94d', '#ff6f8f', '#7fd6c8', '#e6d8bd', '#a58fff'];
  for (let i = 0; i < 22; i++) {
    const b = document.createElement('span');
    b.className = 'bit';
    const ang = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 60;
    b.style.background = pick(colors);
    b.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    b.style.setProperty('--dy', Math.sin(ang) * dist - 20 + 'px');
    b.style.setProperty('--rot', Math.random() * 540 + 'deg');
    confetti.append(b);
    setTimeout(() => b.remove(), 1300);
  }
}

async function onToggle(id) {
  const before = state.today.find((p) => p.id === id);
  const wasDone = before && before.done;
  state = await api.toggle(id);
  render();
  if (!wasDone && state.today.length && pending().length === 0) {
    playAnim('dance', 2600);
    burst();
  } else if (!wasDone) {
    playAnim('hop', 700);
  }
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = addInput.value.trim();
  if (!text) return;
  addInput.value = '';
  state = await api.add(text);
  render();
  playAnim('hop', 700);
  openBubble();
});

carryBtn.onclick = async () => {
  state = await api.carry();
  render();
  playAnim('hop', 700);
  openBubble();
};

// ---------- refresh / nudges ----------
async function refresh() {
  const prevDate = state.date;
  state = await api.getState();
  render();
  if (prevDate && prevDate !== state.date) {
    // new day: ask again
    showTab('today');
    openBubble({ autoHide: false });
    playAnim('hop', 700);
  }
}

function nudgeTick() {
  if (tab === 'schedule' && !bubble.classList.contains('hidden')) return; // don't yank the table away mid-read
  const now = Date.now();
  const total = state.today.length;
  if (total === 0 && !isNight() && now - lastNudge >= ASK_EVERY_MS) {
    lastNudge = now;
    moodOverride = null;
    showTab('today');
    openBubble({ autoHide: false });
    playAnim('hop', 700);
  } else if (pending().length > 0 && !isNight() && now - lastNudge >= NUDGE_EVERY_MS) {
    lastNudge = now;
    moodOverride = 'nudge';
    showTab('today');
    setTimeout(() => {
      moodOverride = null;
      render();
    }, 2200);
    openBubble();
  }
}

setInterval(refresh, 30 * 1000);
setInterval(nudgeTick, 30 * 1000);
api.onOpenBubble(() => openBubble());

// ---------- pointer: click the pet to toggle the bubble, drag to move ----------
let drag = null;
petWrap.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  drag = { sx: e.screenX, sy: e.screenY, moved: false };
  api.dragStart();
});
window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const dx = e.screenX - drag.sx;
  const dy = e.screenY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
  if (drag.moved) api.dragMove(dx, dy);
});
window.addEventListener('mouseup', () => {
  if (!drag) return;
  const wasClick = !drag.moved;
  drag = null;
  api.dragEnd();
  if (wasClick) {
    if (bubble.classList.contains('hidden')) {
      playAnim('hop', 700);
      openBubble();
      if (tab === 'today' && state.today.length === 0) setTimeout(() => addInput.focus(), 80);
    } else {
      hideBubble();
    }
  }
});

// right-click the pet for Hide / Quit
petWrap.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  api.petMenu();
});

// ---------- start ----------
(async function init() {
  state = await api.getState();
  render();
  // On start: ask if no promises, otherwise give a quick status.
  openBubble({ autoHide: state.today.length > 0 });
  if (state.today.length === 0) setTimeout(() => addInput.focus(), 300);
})();
