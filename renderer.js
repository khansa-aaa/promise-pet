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

let state = { date: '', today: [], carryCount: 0, tasks: [], schedule: [], cards: [], ai: { provider: 'claude' } };
let tab = 'today'; // 'today' | 'tasks' | 'schedule' | 'cards'
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
  renderCards();
  setMood(currentMood());
  syncSize();
}

// ---------- backlog: open-ended to-dos with no dates ----------
function showTab(t) {
  tab = t;
  tabToday.classList.toggle('active', t === 'today');
  tabTasks.classList.toggle('active', t === 'tasks');
  tabSched.classList.toggle('active', t === 'schedule');
  tabCards.classList.toggle('active', t === 'cards');
  viewToday.classList.toggle('hidden', t !== 'today');
  viewTasks.classList.toggle('hidden', t !== 'tasks');
  viewSched.classList.toggle('hidden', t !== 'schedule');
  viewCards.classList.toggle('hidden', t !== 'cards');
  bubble.classList.toggle('tall', t === 'cards'); // flashcards get a bit more height than the lists
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

// ---------- flashcards: Manual / Auto (AI) card making, spaced-repetition study ----------
const tabCards = $('tab-cards');
const viewCards = $('view-cards');
const cardsDuePip = $('cards-due');
const deckNamesList = $('deck-names');
const cardsHome = $('cards-home');
const cardsMsg = $('cards-msg');
const cardsStudyBtn = $('cards-study');
const deckList = $('deck-list');
const manualView = $('cards-manual-view');
const manualTitle = $('manual-title');
const cardForm = $('card-form');
const cardDeck = $('card-deck');
const cardFront = $('card-front');
const cardBack = $('card-back');
const cardSave = $('card-save');
const cardCancel = $('card-cancel');
const manualMsg = $('manual-msg');
const cardList = $('card-list');
const autoView = $('cards-auto-view');
const autoSetup = $('auto-setup');
const setupStatus = $('setup-status');
const setupStep = $('setup-step');
const setupCmd = $('setup-cmd');
const setupRun = $('setup-run');
const setupCopy = $('setup-copy');
const setupWait = $('setup-wait');
const setupFine = $('setup-fine');
const autoSetupDone = $('auto-setup-done');
const autoMain = $('auto-main');
const autoWho = $('auto-who');
const autoForm = $('auto-form');
const autoDeck = $('auto-deck');
const autoText = $('auto-text');
const autoCount = $('auto-count');
const autoGo = $('auto-go');
const autoMsg = $('auto-msg');
const autoPreview = $('auto-preview');
const autoAdd = $('auto-add');
const studyView = $('cards-study-view');
const studyProgress = $('study-progress');
const studyCard = $('study-card');
const studyDeck = $('study-deck');
const studyFront = $('study-front');
const studyBack = $('study-back');
const studyShow = $('study-show');
const studyGrades = $('study-grades');
const studyDone = $('study-done');

let cardsScreen = 'home'; // 'home' | 'manual' | 'auto' | 'study'
let editingCardId = null;
let study = null; // { deck, current, shown, done }
let autoCards = []; // AI-made cards waiting for the user to keep or drop
let autoBusy = false;
let autoSetupOpen = false;
let setupProvider = 'claude';

const allCards = () => state.cards || [];
const dueCards = (deck) => allCards().filter((c) => (!deck || c.deck === deck) && SRS.isDue(c));
const deckNames = () => [...new Set(allCards().map((c) => c.deck))].sort((a, b) => a.localeCompare(b));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const cleanDeckName = (v) => v.trim() || 'General';
function nextDueLabel(deck) {
  const later = allCards().filter((c) => !deck || c.deck === deck);
  if (!later.length) return '';
  const soonest = Math.min(...later.map((c) => c.due));
  return `Next card in ${SRS.label(Math.max(0, soonest - Date.now()))}.`;
}
function setMsg(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle('err', isError);
}
function iconButton(cls, label, tip) {
  const b = document.createElement('button');
  b.className = cls;
  b.type = 'button';
  b.textContent = label;
  b.title = tip;
  return b;
}
// first click arms the button, a second click within 2.5s confirms
function confirmClick(btn, onConfirm) {
  let armed = null;
  btn.onclick = (e) => {
    e.stopPropagation();
    if (!armed) {
      btn.textContent = 'Sure?';
      btn.classList.add('armed');
      armed = setTimeout(() => {
        armed = null;
        btn.textContent = '✕';
        btn.classList.remove('armed');
      }, 2500);
      return;
    }
    clearTimeout(armed);
    onConfirm();
  };
}

function showCardsScreen(s) {
  cardsScreen = s;
  cardsHome.classList.toggle('hidden', s !== 'home');
  manualView.classList.toggle('hidden', s !== 'manual');
  autoView.classList.toggle('hidden', s !== 'auto');
  studyView.classList.toggle('hidden', s !== 'study');
  renderCards();
  if (s === 'study') renderStudy();
}
tabCards.onclick = () => showTab('cards');
viewCards.querySelectorAll('.cards-back').forEach((b) => (b.onclick = () => showCardsScreen('home')));

function renderCards() {
  const cards = allCards();
  const due = dueCards(null).length;
  cardsDuePip.textContent = due > 99 ? '99+' : due;
  cardsDuePip.classList.toggle('hidden', due === 0);
  if (tab === 'cards') title.textContent = 'Flashcards';

  const names = deckNames();
  deckNamesList.textContent = '';
  for (const n of names) {
    const o = document.createElement('option');
    o.value = n;
    deckNamesList.append(o);
  }

  // home
  setMsg(
    cardsMsg,
    cards.length
      ? `${plural(cards.length, 'card')} in ${plural(names.length, 'deck')}.`
      : 'Make your first cards: write them yourself, or let AI make them from your notes.'
  );
  cardsStudyBtn.classList.toggle('hidden', !cards.length);
  cardsStudyBtn.disabled = due === 0;
  cardsStudyBtn.textContent = due ? `Study ${plural(due, 'due card')}` : `Nothing due · ${nextDueLabel(null)}`;

  deckList.textContent = '';
  for (const name of names) {
    const inDeck = cards.filter((c) => c.deck === name);
    const d = inDeck.filter((c) => SRS.isDue(c)).length;
    const li = document.createElement('li');
    const txt = document.createElement('span');
    txt.className = 'txt';
    txt.textContent = name;
    const meta = document.createElement('span');
    meta.className = 'deck-meta';
    meta.textContent = `${d ? d + ' due · ' : ''}${plural(inDeck.length, 'card')}`;
    txt.append(meta);
    txt.title = d ? 'Study this deck' : 'Browse this deck';
    txt.onclick = () => (d ? startStudy(name) : openManual(name));
    const ed = iconButton('ed', '✎', 'Add or edit cards');
    ed.onclick = () => openManual(name);
    const rm = iconButton('rm', '✕', 'Delete deck');
    confirmClick(rm, async () => {
      state = await api.deckRemove(name);
      render();
    });
    li.append(txt, ed, rm);
    deckList.append(li);
  }

  if (cardsScreen === 'manual') renderManualList();
  if (cardsScreen === 'auto') renderAuto();
}

// ----- Manual -----
function resetCardForm() {
  editingCardId = null;
  cardFront.value = '';
  cardBack.value = '';
  cardSave.textContent = 'Add card';
  cardCancel.classList.add('hidden');
}
function openManual(deck) {
  const recent = allCards()[allCards().length - 1];
  cardDeck.value = deck || cardDeck.value || (recent ? recent.deck : '');
  resetCardForm();
  setMsg(manualMsg, '');
  showCardsScreen('manual');
  setTimeout(() => (cardDeck.value ? cardFront : cardDeck).focus(), 50);
}
function renderManualList() {
  const deck = cleanDeckName(cardDeck.value);
  const inDeck = allCards().filter((c) => c.deck === deck);
  manualTitle.textContent = `${deck} · ${plural(inDeck.length, 'card')}`;
  cardList.textContent = '';
  for (const c of [...inDeck].reverse()) {
    const li = document.createElement('li');
    if (c.id === editingCardId) li.classList.add('editing');
    const txt = document.createElement('span');
    txt.className = 'txt';
    txt.textContent = c.front;
    const back = document.createElement('small');
    back.textContent = c.back;
    txt.append(back);
    const ed = iconButton('ed', '✎', 'Edit');
    ed.onclick = () => {
      editingCardId = c.id;
      cardDeck.value = c.deck;
      cardFront.value = c.front;
      cardBack.value = c.back;
      cardSave.textContent = 'Save';
      cardCancel.classList.remove('hidden');
      renderManualList();
      cardFront.focus();
    };
    const rm = iconButton('rm', '✕', 'Delete card');
    confirmClick(rm, async () => {
      if (editingCardId === c.id) resetCardForm();
      state = await api.cardRemove(c.id);
      render();
    });
    li.append(txt, ed, rm);
    cardList.append(li);
  }
}
$('cards-manual').onclick = () => openManual('');
cardDeck.addEventListener('input', renderManualList);
cardCancel.onclick = () => {
  resetCardForm();
  renderManualList();
};
cardForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const front = cardFront.value.trim();
  const back = cardBack.value.trim();
  if (!front || !back) {
    setMsg(manualMsg, 'Fill in both the front and the back.', true);
    (front ? cardBack : cardFront).focus();
    return;
  }
  const deck = cleanDeckName(cardDeck.value);
  cardDeck.value = deck;
  const wasEditing = !!editingCardId;
  state = wasEditing ? await api.cardEdit(editingCardId, deck, front, back) : await api.cardAdd(deck, front, back);
  resetCardForm();
  setMsg(manualMsg, wasEditing ? 'Saved.' : 'Added! Write the next one.');
  render();
  if (!wasEditing) playAnim('hop', 700);
  cardFront.focus();
});
// Cmd/Ctrl+Enter saves from anywhere in a card form
for (const el of [cardDeck, cardFront, cardBack]) {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      cardForm.requestSubmit();
    }
  });
}

// ----- Auto (AI, through the person's own Claude or ChatGPT subscription) -----
const AI_INFO = {
  claude: { name: 'Claude', app: 'Claude Code', maker: 'Anthropic', plans: 'Claude Pro or Max' },
  openai: { name: 'ChatGPT', app: 'Codex', maker: 'OpenAI', plans: 'ChatGPT Plus or Pro' }
};
const IS_MAC = navigator.userAgent.includes('Mac');
const aiStatus = {}; // provider -> { installed, loggedIn, account, commands } once checked
let statusPoll = null;
let setupStepName = null; // 'install' | 'login' | null
const aiReady = (p) => !!(aiStatus[p] && aiStatus[p].installed && aiStatus[p].loggedIn);

async function checkStatus(provider) {
  aiStatus[provider] = (await api.aiStatus(provider)) || { installed: false, loggedIn: false };
  if (cardsScreen === 'auto') renderAuto();
}
// while setup waits for an install or sign-in in Terminal, keep checking so the screen updates by itself
function pollStatus(on) {
  if (!on) {
    clearInterval(statusPoll);
    statusPoll = null;
  } else if (!statusPoll) {
    statusPoll = setInterval(() => checkStatus(setupProvider), 4000);
  }
}

async function openAuto() {
  setupProvider = state.ai.provider;
  if (!autoDeck.value) {
    const recent = allCards()[allCards().length - 1];
    autoDeck.value = recent ? recent.deck : '';
  }
  setupWait.textContent = '';
  autoSetupOpen = !aiReady(setupProvider);
  showCardsScreen('auto');
  await checkStatus(setupProvider);
  if (autoSetupOpen && aiReady(setupProvider)) {
    autoSetupOpen = false;
    renderAuto();
  }
  if (!autoSetupOpen) setTimeout(() => autoText.focus(), 50);
}
function renderAuto() {
  autoSetup.classList.toggle('hidden', !autoSetupOpen);
  autoMain.classList.toggle('hidden', autoSetupOpen);

  const info = AI_INFO[setupProvider];
  const st = aiStatus[setupProvider];
  autoSetup.querySelectorAll('[data-provider]').forEach((b) => b.classList.toggle('active', b.dataset.provider === setupProvider));
  setupStepName = null;
  if (!st) {
    setupStatus.textContent = `Checking for ${info.app}…`;
  } else if (!st.installed) {
    setupStepName = 'install';
    setupStatus.textContent = `Step 1 of 2: install ${info.app}, ${info.maker}’s free app that lets Promise Pet use your ${info.name} subscription.`;
  } else if (!st.loggedIn) {
    setupStepName = 'login';
    setupStatus.textContent = `Step 2 of 2: sign in to ${info.app} with your ${info.name} account. A browser window opens to log in.`;
  } else {
    setupStatus.textContent = `✓ ${info.app} is signed in with your ${st.account}.`;
  }
  setupStep.classList.toggle('hidden', !setupStepName);
  if (setupStepName) {
    setupCmd.textContent = st.commands[setupStepName];
    setupRun.classList.toggle('hidden', !IS_MAC);
    setupRun.textContent = setupStepName === 'install' ? 'Install in Terminal' : 'Sign in in Terminal';
  }
  autoSetupDone.classList.toggle('hidden', !aiReady(setupProvider));
  autoSetupDone.textContent = `Use ${info.name}`;
  setupFine.textContent = `Works with ${info.plans}. Cards are made by ${info.app} on this computer and count toward your plan’s usage limits.`;
  pollStatus(autoSetupOpen && tab === 'cards' && cardsScreen === 'auto' && !!st && !aiReady(setupProvider));

  autoWho.textContent = `Using your ${AI_INFO[state.ai.provider].name} subscription`;
  autoGo.disabled = autoBusy;
  autoGo.textContent = autoBusy ? 'Generating…' : 'Generate';

  autoPreview.textContent = '';
  autoCards.forEach((c, i) => {
    const li = document.createElement('li');
    const txt = document.createElement('span');
    txt.className = 'txt';
    txt.textContent = c.front;
    const back = document.createElement('small');
    back.textContent = c.back;
    txt.append(back);
    const rm = iconButton('rm', '✕', 'Don’t keep this card');
    rm.onclick = () => {
      autoCards.splice(i, 1);
      renderAuto();
    };
    li.append(txt, rm);
    autoPreview.append(li);
  });
  autoAdd.classList.toggle('hidden', !autoCards.length);
  autoAdd.textContent = `Add ${plural(autoCards.length, 'card')} to “${cleanDeckName(autoDeck.value)}”`;
}
function openSetup() {
  setupProvider = state.ai.provider;
  autoSetupOpen = true;
  setupWait.textContent = '';
  renderAuto();
  checkStatus(setupProvider);
}
$('cards-auto').onclick = openAuto;
$('auto-change').onclick = openSetup;
autoSetup.querySelectorAll('[data-provider]').forEach((b) => {
  b.onclick = () => {
    setupProvider = b.dataset.provider;
    setupWait.textContent = '';
    renderAuto();
    checkStatus(setupProvider);
  };
});
setupRun.onclick = async () => {
  const opened = await api.aiOpenTerminal(setupProvider, setupStepName);
  setupWait.textContent = opened
    ? 'Finish in the Terminal window. This screen updates by itself when it’s done.'
    : 'Run the command in a terminal. This screen updates by itself when it’s done.';
};
setupCopy.onclick = () => {
  api.aiCopyCommand(setupProvider, setupStepName);
  setupCopy.textContent = 'Copied!';
  setupWait.textContent = 'Paste it into a terminal and run it. This screen updates by itself when it’s done.';
  setTimeout(() => (setupCopy.textContent = 'Copy command'), 1500);
};
autoSetupDone.onclick = async () => {
  state = await api.aiSetProvider(setupProvider);
  autoSetupOpen = false;
  render();
  autoText.focus();
};
autoDeck.addEventListener('input', () => renderAuto());
autoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (autoBusy) return;
  const text = autoText.value.trim();
  if (!text) {
    setMsg(autoMsg, 'Paste some notes or type a topic first.', true);
    autoText.focus();
    return;
  }
  autoBusy = true;
  setMsg(autoMsg, `${AI_INFO[state.ai.provider].name} is writing your cards… this can take a minute.`);
  renderAuto();
  playAnim('hop', 700);
  const res = await api.aiGenerate(text, Number(autoCount.value));
  autoBusy = false;
  if (res.needsSetup) {
    openSetup();
  } else if (res.error) {
    setMsg(autoMsg, res.error, true);
  } else {
    autoCards = res.cards;
    setMsg(autoMsg, `${plural(autoCards.length, 'card')} ready. Remove any you don’t want, then add them.`);
  }
  renderAuto();
});
autoText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    autoForm.requestSubmit();
  }
});
autoAdd.onclick = async () => {
  const deck = cleanDeckName(autoDeck.value);
  const n = autoCards.length;
  state = await api.cardAddMany(deck, autoCards);
  autoCards = [];
  autoText.value = '';
  setMsg(autoMsg, `Added ${plural(n, 'card')} to “${deck}”. Go back to study them, or make more.`);
  render();
  playAnim('hop', 700);
};

// ----- Study -----
function startStudy(deck) {
  study = { deck, current: null, shown: false, done: 0 };
  nextStudyCard();
  showCardsScreen('study');
}
function nextStudyCard() {
  const queue = dueCards(study.deck).sort((a, b) => a.due - b.due);
  study.current = queue[0] || null;
  study.left = queue.length;
  study.shown = false;
}
function renderStudy() {
  if (!study) return;
  const c = study.current;
  studyCard.classList.toggle('hidden', !c);
  studyShow.classList.toggle('hidden', !c || study.shown);
  studyGrades.classList.toggle('hidden', !c || !study.shown);
  studyDone.classList.toggle('hidden', !!c);
  studyProgress.textContent = c ? `${study.deck || 'All decks'} · ${study.left} left` : '';
  if (!c) {
    studyDone.textContent = study.done
      ? `Done! You reviewed ${plural(study.done, 'card')}. ${nextDueLabel(study.deck)}`
      : `Nothing due right now. ${nextDueLabel(study.deck)}`;
    return;
  }
  studyDeck.textContent = c.deck;
  studyFront.textContent = c.front;
  studyBack.textContent = c.back;
  studyBack.classList.toggle('hidden', !study.shown);
  studyGrades.querySelectorAll('[data-grade]').forEach((b, i) => {
    b.querySelector('small').textContent = `${SRS.label(SRS.schedule(c, b.dataset.grade).wait)} · ${i + 1}`;
  });
}
function showAnswer() {
  if (!study || !study.current) return;
  study.shown = true;
  renderStudy();
}
async function gradeCard(grade) {
  if (!study || !study.current || !study.shown) return;
  state = await api.cardReview(study.current.id, grade);
  study.done++;
  nextStudyCard();
  render();
  renderStudy();
  if (!study.current) {
    playAnim('dance', 2600);
    burst();
  }
}
cardsStudyBtn.onclick = () => startStudy(null);
studyShow.onclick = showAnswer;
studyGrades.querySelectorAll('[data-grade]').forEach((b) => (b.onclick = () => gradeCard(b.dataset.grade)));
// space/enter shows the answer, 1–4 picks Again/Hard/Good/Easy
document.addEventListener('keydown', (e) => {
  if (tab !== 'cards' || cardsScreen !== 'study' || bubble.classList.contains('hidden')) return;
  if (e.target.matches && e.target.matches('input, textarea, select')) return;
  if ((e.key === ' ' || e.key === 'Enter') && study && study.current && !study.shown) {
    e.preventDefault();
    showAnswer();
  } else if (study && study.shown && ['1', '2', '3', '4'].includes(e.key)) {
    gradeCard(SRS.GRADES[Number(e.key) - 1]);
  }
});

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
  if ((tab === 'schedule' || tab === 'cards') && !bubble.classList.contains('hidden')) return; // don't yank the table or a study session away
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
