/*
 * Low-Hanging Fruit app. Plain JS, no build step, no dependencies.
 *
 * The pure helpers at the top have no DOM and are unit-tested in Node
 * (tests/app.test.js). Everything that touches the page is inside the block
 * guarded by `typeof document !== 'undefined'`. All date, streak and wording
 * rules live in rules.js, loaded before this file as a plain script; this file
 * only draws what they say and keeps the document in localStorage.
 */
'use strict';

var APP_VERSION = '2026.10.20.1';
var STORAGE = { settings: 'fruit.settings', data: 'fruit.data', backup: 'fruit.backup' };
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var MIN_SWIPE_PX = 50;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function isIsoDate(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  var leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
}

/** 'YYYY-MM-DD' shown to a human as DD-Mmm-YY, e.g. '17-Oct-26'. Anything else is returned as is. */
function formatDisplayDate(iso) {
  if (!isIsoDate(iso)) return iso == null ? '' : String(iso);
  var p = iso.split('-');
  return p[2] + '-' + MONTHS[Number(p[1]) - 1] + '-' + p[0].slice(2);
}

/** 'Saturday 17-Oct-26', for the Today title. weekday is 0 = Sunday … 6 = Saturday. */
function longDate(iso, weekday) {
  return LONG_DAYS[weekday] + ' ' + formatDisplayDate(iso);
}

/** 'Oct 2026' for the calendar head, from 'YYYY-MM'. */
function monthWords(ym) {
  return MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);
}

/**
 * One gray line in sentence case from its parts: the first letter of the line capitalized, every
 * later part starting lowercase, except a day name (Mon, Wed, Fri) or a date (25-Oct-26), which keep
 * their capitals. Parts are joined with a middle dot.
 */
function sentenceLine(parts) {
  var keep = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b|^\d/;
  var out = parts.filter(Boolean).map(function (p, i) {
    p = String(p);
    if (i === 0) return p.charAt(0).toUpperCase() + p.slice(1);
    return keep.test(p) ? p : p.charAt(0).toLowerCase() + p.slice(1);
  });
  return out.join(' · ');
}

/** 'day', 'days', 'week', 'weeks': the unit a habit's streak is counted in. */
function streakUnit(habit, n) {
  return (habit.schedule.kind === 'weekly' ? 'week' : 'day') + (n === 1 ? '' : 's');
}

/** '12-day streak', '1-day streak', '3-week streak', or 'No streak' at zero. */
function streakWords(habit, n) {
  if (!n) return 'No streak';
  return n + '-' + (habit.schedule.kind === 'weekly' ? 'week' : 'day') + ' streak';
}

/**
 * The next amount when a once-a-day pill is tapped. It cycles ring, check, cross, ring: for a start
 * habit nothing, done (1), not today (0, kept as the mark, on today only), nothing; for a stop habit
 * with a limit of 0 nothing, marked (0), slipped (1), nothing. NaN means remove the entry.
 */
function cycleAmount(habit, amount, isLogged, isToday) {
  if (habit.direction === 'stop') {
    if (!isLogged) return 0;
    return amount === 0 ? 1 : NaN;
  }
  if (amount > 0) return isToday ? 0 : NaN;
  // A past 0 and a past blank are the same missed day, so either goes straight to done.
  return isLogged && isToday ? NaN : 1;
}

/** '74%' from a completion object, '' when there is nothing to count. */
function percentWords(c) {
  return c ? Math.round((c.done / c.scheduled) * 100) + '%' : '';
}

/**
 * The control on a row: 'check' for a once-a-day start habit and a stop habit with a limit of 0 (one pill
 * that cycles ring, check, cross), 'count' for N times, 'amount' for a measured unit, 'slips' for a stop
 * habit with a limit above 0.
 */
function controlKind(habit) {
  if (habit.direction === 'stop') return habit.goal.amount > 0 ? 'slips' : 'check';
  if (habit.goal.unit !== 'times') return 'amount';
  return habit.goal.amount === 1 ? 'check' : 'count';
}

function emptyDocument() { return { v: 1, updated: '', habits: [] }; }

function newId() {
  return 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** The edit form's fields for a new habit. */
function blankDraft() {
  return { direction: 'start', action: '', cue: '', identity: '', kind: 'days', days: [0, 1, 2, 3, 4, 5, 6], times: 3, every: 3, amount: 1, unit: 'times' };
}

/** The edit form's fields for an existing habit. */
function draftFrom(habit) {
  var s = habit.schedule;
  return {
    direction: habit.direction, action: habit.action, cue: habit.cue || '', identity: habit.identity,
    kind: s.kind,
    days: s.kind === 'days' ? s.days.slice() : [0, 1, 2, 3, 4, 5, 6],
    times: s.kind === 'weekly' ? s.times : 3,
    every: s.kind === 'every' ? s.days : 3,
    amount: habit.goal.amount, unit: habit.goal.unit
  };
}

/**
 * Checks a draft and, when it is sound, returns { schedule, goal, action, cue, identity, direction }.
 * Otherwise returns { error } with one sentence naming the first problem.
 */
function validateDraft(d) {
  var action = String(d.action || '').trim(), cue = String(d.cue || '').trim(), identity = String(d.identity || '').trim();
  var stop = d.direction === 'stop';
  if (!action) return { error: stop ? 'Say what you will not do.' : 'Say what you will do.' };
  if (!identity) return { error: 'Say who you want to become.' };
  var schedule;
  if (d.kind === 'days') {
    var days = (d.days || []).filter(function (x) { return x >= 0 && x <= 6; }).sort();
    if (!days.length) return { error: 'Pick at least one day.' };
    schedule = { kind: 'days', days: days };
  } else if (d.kind === 'weekly') {
    var times = Number(d.times);
    if (!(times >= 1 && times <= 7) || times !== Math.floor(times)) return { error: 'Days a week must be a whole number from 1 to 7.' };
    schedule = { kind: 'weekly', times: times };
  } else if (d.kind === 'every' && !stop) {
    var every = Number(d.every);
    if (!(every >= 1) || every !== Math.floor(every)) return { error: 'Every how many days must be a whole number, 1 or more.' };
    schedule = { kind: 'every', days: every };
  } else {
    return { error: 'Pick a schedule.' };
  }
  var amount = Number(d.amount);
  if (!isFinite(amount) || (stop ? amount < 0 : amount <= 0)) {
    return { error: stop ? 'The limit must be 0 or more.' : 'The amount must be a number above 0.' };
  }
  var unit = String(d.unit || '').trim() || 'times';
  if (unit === 'times' && amount !== Math.floor(amount)) return { error: 'Times must be a whole number.' };
  return { direction: stop ? 'stop' : 'start', action: action, cue: cue, identity: identity, schedule: schedule, goal: { amount: amount, unit: unit } };
}

/**
 * The log with one day set: a new object. The day is removed when the amount is not above 0,
 * except that with keepZero a 0 is kept: it is a mark, a stop habit's "nothing to report" or a once-a-day
 * start habit's "not today".
 */
function withAmount(log, date, amount, keepZero) {
  var next = {};
  Object.keys(log || {}).forEach(function (k) { next[k] = log[k]; });
  var keep = typeof amount === 'number' && isFinite(amount) && (amount > 0 || (keepZero && amount === 0));
  if (keep) next[date] = amount; else delete next[date];
  return next;
}

/** 42 cells for a month grid, Sunday first: 'YYYY-MM-DD' or null, from 'YYYY-MM' and the weekday of its first day. */
function monthCells(ym, firstWeekday, daysInMonth) {
  var cells = [], i;
  for (i = 0; i < firstWeekday; i++) cells.push(null);
  for (i = 1; i <= daysInMonth; i++) cells.push(ym + '-' + (i < 10 ? '0' : '') + i);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function daysInMonth(ym) {
  var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  var leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** 'YYYY-MM' plus n months. */
function addMonths(ym, n) {
  var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + '-' + (m + 1 < 10 ? '0' : '') + (m + 1);
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined') {
  (function () {
    var R = window; // rules.js is a plain script: its functions are globals

    function load(key, fallback) {
      try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (err) { return fallback; }
    }
    function save(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (err) { return false; }
    }
    function $(id) { return document.getElementById(id); }
    function el(tag, cls, text) {
      var node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text != null) node.textContent = text;
      return node;
    }
    function button(cls, text, onClick, label) {
      var b = el('button', cls, text);
      b.type = 'button';
      if (label) b.setAttribute('aria-label', label);
      b.addEventListener('click', onClick);
      return b;
    }

    var PALETTES = ['pear', 'peach', 'blackberry'];
    var settings = load(STORAGE.settings, { url: '', token: '', theme: 'auto', palette: 'pear' });
    if (!settings.theme) settings.theme = 'auto';
    if (PALETTES.indexOf(settings.palette) === -1) settings.palette = 'pear';
    var doc = load(STORAGE.data, emptyDocument());
    if (!doc || doc.v !== 1 || !Array.isArray(doc.habits)) doc = emptyDocument();
    var ui = {
      today: R.localToday(), tab: 0, habitId: null, editId: null, draft: null,
      calMonth: null, selected: null, showUnscheduled: false, showArchived: false, snooze: 'tomorrow', pop: null
    };
    var toastTimer = null;

    function habitById(id) {
      for (var i = 0; i < doc.habits.length; i++) if (doc.habits[i].id === id) return doc.habits[i];
      return null;
    }
    function active() { return doc.habits.filter(function (h) { return !h.archived; }); }
    function archived() { return doc.habits.filter(function (h) { return h.archived; }); }

    /** Every change goes through here: stamps the document, stores it, and redraws unless told not to. */
    function commit(quiet) {
      doc.updated = new Date().toISOString();
      if (!save(STORAGE.data, doc)) toast('Could not save on this device: storage is full or blocked.');
      if (!quiet) render();
    }
    function setAmount(habit, date, amount, quiet) {
      // Where the row's fill was, so it can animate from there. A measured field writes quietly on every
      // keystroke, so the first write records the start and the later ones leave it alone until a redraw.
      if (!ui.popFrom || ui.popFrom.id !== habit.id) ui.popFrom = { id: habit.id, fill: fillState(habit, date) };
      habit.log = withAmount(habit.log, date, amount, habit.direction === 'stop' || controlKind(habit) === 'check');
      ui.pop = habit.id; // the control that changed pops once when it is redrawn
      commit(quiet);
    }
    /** How much of a row is filled and in which color: { p, bg } with bg 'leaf', 'spot', 'pear' or ''. */
    function fillState(h, date) {
      var st = R.dayState(h, date, ui.today), a = amountOn(h, date);
      if (h.direction === 'stop') return st === 'done' ? { p: 1, bg: 'leaf' } : st === 'missed' && a > h.goal.amount ? { p: 1, bg: 'spot' } : { p: 0, bg: '' };
      if (st === 'done') return { p: 1, bg: 'leaf' };
      if (st === 'missed' && a === 0 && R.logged(h, date) && controlKind(h) === 'check') return { p: 1, bg: 'spot' };
      if (a > 0 && h.goal.amount > 0) return { p: Math.min(1, a / h.goal.amount), bg: 'pear' };
      return { p: 0, bg: '' };
    }
    function amountOn(habit, date) { var a = habit.log[date]; return typeof a === 'number' ? a : 0; }

    // ---- theme ----

    var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    function applyTheme() {
      var root = document.documentElement;
      root.setAttribute('data-theme', settings.theme);
      root.setAttribute('data-palette', settings.palette);
      root.classList.toggle('system-dark', !!(darkQuery && darkQuery.matches));
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--elev').trim() || '#ffffff');
    }
    if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', applyTheme);

    // ---- toast ----

    function toast(text) {
      var t = $('toast');
      t.textContent = text;
      t.classList.remove('hidden');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 2500);
    }

    // ---- screens ----

    function openScreen(id) {
      var s = $(id);
      s.classList.add('open');
      s.setAttribute('aria-hidden', 'false');
      s.querySelector('.scroll').scrollTop = 0;
    }
    function closeScreen(id) {
      var s = $(id);
      s.classList.remove('open');
      s.setAttribute('aria-hidden', 'true');
      if (id === 'screen-habit') { ui.habitId = null; ui.selected = null; }
      if (id === 'screen-edit') { ui.editId = null; ui.draft = null; }
    }
    document.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { closeScreen(b.getAttribute('data-close')); render(); });
    });

    function openHabit(id) {
      ui.habitId = id;
      ui.selected = null;
      ui.calMonth = ui.today.slice(0, 7);
      renderDetail();
      openScreen('screen-habit');
    }
    function openEdit(id) {
      ui.editId = id;
      ui.draft = id ? draftFrom(habitById(id)) : blankDraft();
      $('edit-title').textContent = id ? 'Edit habit' : 'New habit';
      fillEditForm();
      renderEdit();
      openScreen('screen-edit');
    }

    // ---- tabs and swipe ----

    function setTab(n) {
      ui.tab = n;
      $('pages').style.transform = 'translateX(-' + (n * 100) + '%)';
      document.querySelectorAll('.tab').forEach(function (b) {
        var on = Number(b.getAttribute('data-tab')) === n;
        b.classList.toggle('on', on);
        if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      });
      renderHeader();
    }
    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () { setTab(Number(b.getAttribute('data-tab'))); });
    });
    /** A horizontal swipe on `area`, Show Time's rule: at least MIN_SWIPE_PX, and horizontal movement must dominate. */
    function swipe(area, onLeft, onRight) {
      var x0 = null, y0 = null, x1 = null, y1 = null;
      area.addEventListener('touchstart', function (e) { x0 = e.targetTouches[0].clientX; y0 = e.targetTouches[0].clientY; x1 = y1 = null; }, { passive: true });
      area.addEventListener('touchmove', function (e) { x1 = e.targetTouches[0].clientX; y1 = e.targetTouches[0].clientY; }, { passive: true });
      area.addEventListener('touchend', function () {
        if (x0 == null || x1 == null) return;
        var dx = x0 - x1, dy = Math.abs(y0 - y1);
        if (dy > Math.abs(dx) * 0.75) return;
        if (dx > MIN_SWIPE_PX) onLeft(); else if (dx < -MIN_SWIPE_PX) onRight();
      }, { passive: true });
    }
    swipe($('pages-wrap'), function () { if (ui.tab < 1) setTab(ui.tab + 1); }, function () { if (ui.tab > 0) setTab(ui.tab - 1); });

    // ---- rendering ----

    function render() {
      renderHeader();
      renderToday();
      renderHabits();
      if (ui.habitId) renderDetail();
      $('theme').value = settings.theme;
      $('palette').value = settings.palette;
      ui.pop = null; ui.popFrom = null; // a redraw consumes the pending pop and its starting fill
    }

    function renderHeader() {
      $('title').textContent = ui.tab === 0 ? 'Today' : 'Habits';
    }

    /** One row: the identity, one gray line (what the day asks, the streak, the hint), and the pill for the goal. */
    function habitRow(h, date, opts) {
      var kind = controlKind(h), st = R.dayState(h, date, ui.today), stop = h.direction === 'stop';
      var a = amountOn(h, date), marked = R.logged(h, date);
      var row = el('div', 'row');
      if (stop) { if (st === 'missed') row.classList.add('over'); else if (st === 'done') row.classList.add('clean'); }
      else if (st === 'done') row.classList.add('done');
      else if (st === 'missed' && marked && a === 0 && kind === 'check') row.classList.add('over'); // marked not today
      var fs = fillState(h, date);
      if (fs.bg === 'pear') { row.classList.add('part'); row.style.setProperty('--p', String(fs.p)); }
      if (ui.pop === h.id && date === ui.today && fs.bg) {
        // Animate from the previous fill to this one; from nothing, the new color simply sweeps in.
        var from = ui.popFrom && ui.popFrom.id === h.id ? ui.popFrom.fill : { p: 0, bg: '' };
        row.classList.add('anim');
        row.style.setProperty('--from', String(from.p));
        row.style.setProperty('--from-bg', 'var(--' + (from.bg || fs.bg) + ')');
      }

      var text = button('text', null, function () { openHabit(h.id); });
      text.appendChild(el('span', 'lead', R.identityWords(h)));
      var meta = [R.actionWords(h)];
      if (opts && opts.words) meta.push(R.scheduleWords(h));
      if (st === 'done') meta.push(streakWords(h, R.currentStreak(h, ui.today)));
      if (R.forgiven(h, ui.today)) meta.push("Don't miss twice");
      text.appendChild(el('span', 'sub', sentenceLine(meta)));
      row.appendChild(text);

      var control;
      if (kind === 'check') {
        // One pill that cycles: a ring (unanswered), a check (done; nothing to report), a cross (not today;
        // slipped), then the ring again. No word names the state.
        var on = stop ? marked && a === 0 : a > 0;
        var slip = stop ? a > 0 : marked && a === 0;
        var label = stop
          ? (!marked ? 'Not yet marked. Tap to mark nothing to report' : a === 0 ? 'Nothing to report. Tap to mark a slip' : 'Slipped. Tap to clear')
          : (!marked ? 'Not yet done. Tap to mark done' : a > 0 ? 'Done. Tap to mark not today' : 'Not today. Tap to clear');
        control = button('check' + (on ? ' on' : '') + (slip ? ' slip' : ''), null, function () {
          setAmount(h, date, cycleAmount(h, a, marked, date === ui.today));
        }, label);
        row.appendChild(control);
      } else if (kind === 'count') {
        var limit = h.goal.amount;
        var stepper = el('div', 'stepper');
        if (a > 0 && a < limit) stepper.classList.add('partial');
        var minus = button(null, '−', function () { setAmount(h, date, Math.max(0, a - 1)); }, 'Undo one');
        minus.disabled = a <= 0;
        var plus = button(null, '+', function () { setAmount(h, date, a + 1); }, 'One more');
        stepper.appendChild(minus);
        stepper.appendChild(el('span', 'n', a + ' of ' + limit));
        stepper.appendChild(plus);
        control = stepper;
        row.appendChild(stepper);
      } else if (kind === 'slips') {
        // A limit above 0. Unlogged: the middle is an empty ring; a tap marks the day with nothing to report
        // and the middle becomes "0 of 2". + logs a slip, − takes one back, and − at zero takes the mark back.
        var lim = h.goal.amount;
        var box = el('div', 'stepper');
        var back = button(null, '−', function () { setAmount(h, date, a > 0 ? a - 1 : NaN); }, a > 0 ? 'Undo a slip' : 'Take back the mark');
        back.disabled = !marked;
        box.appendChild(back);
        if (!marked) {
          var ring = button('n mark', null, function () { setAmount(h, date, 0); }, 'Mark the day: nothing to report');
          ring.appendChild(el('i', 'ring'));
          box.appendChild(ring);
        } else {
          box.appendChild(el('span', 'n', a + ' of ' + lim));
        }
        box.appendChild(button(null, '+', function () { setAmount(h, date, a + 1); }, 'Slipped'));
        control = box;
        row.appendChild(box);
      } else {
        var wrap = el('div', 'amount');
        var input = el('input');
        input.type = 'number'; input.inputMode = 'decimal'; input.min = '0'; input.step = 'any';
        input.value = a > 0 ? String(a) : '';
        input.placeholder = String(h.goal.amount);
        input.setAttribute('aria-label', 'Amount in ' + h.goal.unit);
        // Stored on every keystroke, so a value in the field survives the app being put away with the
        // keyboard open; the row is redrawn only when the field is left, so typing is not interrupted.
        input.addEventListener('input', function () { setAmount(h, date, input.valueAsNumber, true); });
        input.addEventListener('change', function () { setAmount(h, date, input.valueAsNumber); });
        wrap.appendChild(input);
        wrap.appendChild(el('span', null, h.goal.unit));
        control = wrap;
        row.appendChild(wrap);
      }
      if (ui.pop === h.id && date === ui.today) { control.classList.add('pop'); ui.pop = null; }
      return row;
    }

    function renderToday() {
      var root = $('today');
      root.textContent = '';
      // The date lives in the page, not the header, so the header is one height on both pages.
      root.appendChild(el('p', 'date', longDate(ui.today, R.weekday(ui.today))));
      var live = active();
      if (!live.length) {
        var empty = el('div', 'empty', 'No habits yet.');
        empty.appendChild(button('btn primary', 'Add a habit', function () { openEdit(null); }));
        root.appendChild(empty);
        return;
      }
      var scheduled = live.filter(function (h) { return R.isScheduled(h, ui.today); });
      // The whole day's reward is one line: the date says so when every scheduled habit is done.
      if (scheduled.length && scheduled.every(function (h) { return R.dayState(h, ui.today, ui.today) === 'done'; })) {
        root.firstChild.textContent += ' · all done';
      }
      // A bonus day is a start habit's idea; a stop habit asks nothing on an unscheduled day.
      var others = live.filter(function (h) { return !R.isScheduled(h, ui.today) && h.direction !== 'stop'; });

      var sec = el('div', 'section');
      var card = el('div', 'card list');
      if (scheduled.length) scheduled.forEach(function (h) { card.appendChild(habitRow(h, ui.today)); });
      else card.appendChild(el('div', 'empty', 'Nothing scheduled today.'));
      sec.appendChild(card);
      root.appendChild(sec);

      if (others.length) {
        var sec2 = el('div', 'section');
        var head = button('group-head', null, function () { ui.showUnscheduled = !ui.showUnscheduled; render(); });
        head.setAttribute('aria-expanded', ui.showUnscheduled ? 'true' : 'false');
        head.appendChild(el('span', null, 'Not scheduled today · ' + others.length));
        head.appendChild(el('span', 'chev', '›'));
        sec2.appendChild(head);
        if (ui.showUnscheduled) {
          var card2 = el('div', 'card list');
          others.forEach(function (h) { card2.appendChild(habitRow(h, ui.today)); });
          sec2.appendChild(card2);
        }
        root.appendChild(sec2);
      }
    }

    function listRow(h) {
      var row = el('div', 'row');
      var text = button('text', null, function () { openHabit(h.id); });
      text.appendChild(el('span', 'lead', R.identityWords(h)));
      var z = h.archived ? null : R.snoozeOn(h, ui.today);
      text.appendChild(el('span', 'sub', sentenceLine([R.actionWords(h), R.scheduleWords(h), h.archived ? 'archived ' + formatDisplayDate(h.archived) : '', z ? snoozeWords(z) : ''])));
      row.appendChild(text);
      row.appendChild(el('span', 'streak', streakWords(h, R.currentStreak(h, ui.today))));
      return row;
    }

    function renderHabits() {
      var root = $('habits');
      root.textContent = '';
      var live = active(), gone = archived();
      if (!live.length && !gone.length) {
        root.appendChild(el('div', 'empty', 'No habits yet. Add one above.'));
        return;
      }
      if (live.length) {
        var card = el('div', 'card list');
        live.forEach(function (h) { card.appendChild(listRow(h)); });
        var sec = el('div', 'section');
        sec.appendChild(card);
        root.appendChild(sec);
      }
      if (gone.length) {
        var sec2 = el('div', 'section');
        var head = button('group-head', null, function () { ui.showArchived = !ui.showArchived; render(); });
        head.setAttribute('aria-expanded', ui.showArchived ? 'true' : 'false');
        head.appendChild(el('span', null, 'Archived · ' + gone.length));
        head.appendChild(el('span', 'chev', '›'));
        sec2.appendChild(head);
        if (ui.showArchived) {
          var card2 = el('card', 'card list');
          card2 = el('div', 'card list');
          gone.forEach(function (h) { card2.appendChild(listRow(h)); });
          sec2.appendChild(card2);
        }
        root.appendChild(sec2);
      }
    }

    // ---- habit detail ----

    function figure(num, lbl, sub) {
      var f = el('div', 'figure');
      f.appendChild(el('div', 'num', num));
      f.appendChild(el('div', 'lbl', lbl));
      if (sub) f.appendChild(el('div', 'sub', sub));
      return f;
    }

    /**
     * The class a calendar day gets, from the rules, judged against `end` (the archive date for
     * an archived habit) so the calendar matches the frozen figures. Today is unsettled to the
     * rules while it is short of the goal, but a start logged for it still shows as partial.
     */
    function dayClass(h, date, end) {
      if (date < h.created || date > end) return 'off';
      var st = R.dayState(h, date, end), sched = R.isScheduled(h, date);
      if (h.direction === 'stop') {
        // A stop habit's unlogged past day is "missed" to the rules, but only a scheduled one shows so.
        if (!sched) return '';
        return st === 'missed' ? 'missed' : st === 'done' ? 'done' : '';
      }
      if (st === 'done') return 'done';
      if (st === 'partial' || (st === 'unsettled' && amountOn(h, date) > 0)) return 'partial';
      if (st === 'missed' && sched) return 'missed';
      return '';
    }

    function renderDetail() {
      var h = habitById(ui.habitId);
      var root = $('habit-detail');
      root.textContent = '';
      if (!h) return;
      var end = h.archived && h.archived < ui.today ? h.archived : ui.today;
      var f = R.figures(h, ui.today);

      var top = el('div', 'section');
      top.appendChild(el('p', 'statement', R.statement(h)));
      top.appendChild(el('p', 'words', R.scheduleWords(h) + (h.archived ? ' · archived ' + formatDisplayDate(h.archived) : '')));
      var z = R.snoozeOn(h, ui.today);
      if (z && !h.archived) top.appendChild(el('p', 'words snoozed', snoozeWords(z)));
      root.appendChild(top);

      var figs = el('div', 'card figures');
      figs.appendChild(figure(String(f.streak), 'Current streak', streakUnit(h, f.streak)));
      figs.appendChild(figure(String(f.best), 'Best streak', streakUnit(h, f.best)));
      figs.appendChild(figure(percentWords(f.completion) || '—', 'Completion', f.completion ? f.completion.done + ' of ' + f.completion.scheduled : 'nothing to count yet'));
      figs.appendChild(figure(String(f.total), 'Total', h.direction === 'stop' ? (h.goal.amount > 0 ? 'days within the limit' : 'days without a slip') : 'days done'));
      var fsec = el('div', 'section');
      fsec.appendChild(figs);
      root.appendChild(fsec);

      // Calendar
      var minMonth = h.created.slice(0, 7), maxMonth = end.slice(0, 7);
      if (!ui.calMonth || ui.calMonth > maxMonth) ui.calMonth = maxMonth;
      if (ui.calMonth < minMonth) ui.calMonth = minMonth;
      var ym = ui.calMonth;
      function showMonth(target) {
        if (target < minMonth || target > maxMonth) return;
        ui.calMonth = target; ui.selected = null; renderDetail();
      }
      var card = el('div', 'card');
      var head = el('div', 'cal-head');
      var prev = button(null, '‹', function () { showMonth(addMonths(ym, -1)); }, 'Earlier month');
      prev.disabled = ym <= minMonth;
      var next = button(null, '›', function () { showMonth(addMonths(ym, 1)); }, 'Later month');
      next.disabled = ym >= maxMonth;
      head.appendChild(prev);
      head.appendChild(el('span', 'month', monthWords(ym)));
      head.appendChild(next);
      card.appendChild(head);

      var grid = el('div', 'cal');
      // A swipe on the grid turns the month the same way the arrows do: left for later, right for earlier.
      swipe(grid, function () { showMonth(addMonths(ym, 1)); }, function () { showMonth(addMonths(ym, -1)); });
      R.DAY_NAMES.forEach(function (d) { grid.appendChild(el('div', 'dow', d.charAt(0))); });
      var first = ym + '-01';
      monthCells(ym, R.weekday(first), daysInMonth(ym)).forEach(function (date) {
        if (!date) { grid.appendChild(el('div', 'day blank')); return; }
        var cls = dayClass(h, date, end);
        var cell = button('day' + (cls ? ' ' + cls : ''), String(Number(date.slice(8, 10))), function () { tapDay(h, date); }, formatDisplayDate(date));
        if (date === ui.today) cell.classList.add('today');
        if (date === ui.selected) cell.classList.add('selected');
        // A stop habit asks nothing on an unscheduled day, so there is nothing to log there.
        if (cls === 'off' || h.archived || (h.direction === 'stop' && !R.isScheduled(h, date))) cell.disabled = true;
        grid.appendChild(cell);
      });
      card.appendChild(grid);

      var legend = el('div', 'legend');
      var limited = h.direction === 'stop' && h.goal.amount > 0;
      [['l-done', h.direction === 'stop' ? (limited ? 'within the limit' : 'no slip') : 'done'], ['l-partial', 'partial'], ['l-missed', h.direction === 'stop' ? (limited ? 'over the limit, or not marked' : 'a slip, or not marked') : 'missed']].forEach(function (p) {
        if (h.direction === 'stop' && p[0] === 'l-partial') return;
        var li = el('span');
        li.appendChild(el('i', p[0]));
        li.appendChild(document.createTextNode(p[1]));
        legend.appendChild(li);
      });
      card.appendChild(legend);

      // The editor for a day that needs more than a tap
      if (ui.selected && !h.archived && controlKind(h) !== 'check') {
        var ed = el('div', 'day-editor');
        ed.appendChild(el('span', 'lbl', formatDisplayDate(ui.selected)));
        var r = habitRow(h, ui.selected);
        var control = r.lastChild;
        ed.appendChild(control);
        card.appendChild(ed);
      }
      var csec = el('div', 'section');
      csec.appendChild(card);
      root.appendChild(csec);

      // Actions
      var acts = el('div', 'section');
      acts.appendChild(button('btn secondary', 'Edit', function () { openEdit(h.id); }));
      if (!h.archived) {
        acts.appendChild(button('btn secondary', z ? 'End snooze' : 'Snooze', function () {
          if (z) { endSnooze(h, z); return; }
          ui.snooze = 'tomorrow';
          $('snooze-date').value = '';
          $('snooze-date').min = R.addDays(ui.today, 1);
          renderSnooze();
          openScreen('screen-snooze');
        }));
      }
      acts.appendChild(button('btn secondary', h.archived ? 'Unarchive' : 'Archive', function () {
        h.archived = h.archived ? null : ui.today;
        commit();
        toast(h.archived ? 'Archived' : 'Back in the list');
      }));
      acts.appendChild(button('btn outline-destructive', 'Delete', function () {
        if (!window.confirm('Delete this habit and all of its history? This cannot be undone.')) return;
        doc.habits = doc.habits.filter(function (x) { return x.id !== h.id; });
        closeScreen('screen-habit');
        commit();
        toast('Habit deleted');
      }));
      root.appendChild(acts);
    }

    function tapDay(h, date) {
      if (h.archived) return;
      var kind = controlKind(h);
      var a = amountOn(h, date);
      if (kind === 'check') { setAmount(h, date, cycleAmount(h, a, R.logged(h, date), date === ui.today)); return; }
      ui.selected = date;
      renderDetail();
    }

    // ---- new / edit habit ----

    function fillEditForm() {
      var d = ui.draft;
      $('action').value = d.action;
      $('cue').value = d.cue;
      $('identity').value = d.identity;
      $('times').value = d.times;
      $('every').value = d.every;
      $('amount').value = d.amount;
      $('unit').value = d.unit;
    }

    function renderEdit() {
      var d = ui.draft;
      if (!d) return;
      var stop = d.direction === 'stop';
      document.querySelectorAll('[data-direction]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-direction') === d.direction); });
      $('action-label').textContent = stop ? 'I will not…' : 'I will…';
      // The placeholders follow the direction, with the spec's own two examples.
      $('action').placeholder = stop ? 'drink more than two beers' : 'get out of bed';
      $('cue').placeholder = stop ? 'on a weeknight' : 'before 6 a.m.';
      $('identity').placeholder = stop ? 'a clear-headed person' : 'a morning person';
      $('kind-every').classList.toggle('hidden', stop);
      if (stop && d.kind === 'every') d.kind = 'days';
      document.querySelectorAll('[data-kind]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-kind') === d.kind); });
      $('sched-days').classList.toggle('hidden', d.kind !== 'days');
      $('sched-weekly').classList.toggle('hidden', d.kind !== 'weekly');
      $('sched-every').classList.toggle('hidden', d.kind !== 'every');
      $('times-label').textContent = stop ? 'Days a week within the limit' : 'Days a week';
      document.querySelectorAll('[data-day]').forEach(function (b) { b.setAttribute('aria-pressed', d.days.indexOf(Number(b.getAttribute('data-day'))) !== -1 ? 'true' : 'false'); });
      $('goal-title').textContent = stop ? 'Limit' : 'Goal';
      $('amount-label').textContent = stop ? 'At most, a day' : 'A day';

      // The live sentence
      var s = $('sentence');
      s.textContent = '';
      function part(text, blank) { s.appendChild(el('span', blank ? 'blank' : null, text)); }
      part(stop ? 'I will not ' : 'I will ');
      part(d.action.trim() || '…', !d.action.trim());
      if (d.cue.trim()) part(' ' + d.cue.trim());
      part(' so that I can become ');
      part(d.identity.trim() || '…', !d.identity.trim());
      if (d.identity.trim()) part('.');

      var v = validateDraft(d);
      $('save-habit').disabled = !!v.error;
      $('edit-error').textContent = '';
      $('sched-words').textContent = v.error ? '' : R.scheduleWords({ direction: v.direction, schedule: v.schedule, goal: v.goal });
      $('goal-hint').textContent = stop
        ? (Number(d.amount) === 0 ? 'None at all. Each day, tap the ring when there was nothing to report, or log a slip.' : 'Each day, tap the ring or log the slips; the day counts while they stay within the limit.')
        : (controlKind({ direction: 'start', goal: { amount: Number(d.amount), unit: String(d.unit).trim() || 'times' } }) === 'check'
          ? 'Once a day: a check on the Today page.'
          : (String(d.unit).trim() === 'times' ? 'A counter on the Today page.' : 'A number field on the Today page.'));
    }

    document.querySelectorAll('[data-direction]').forEach(function (b) {
      b.addEventListener('click', function () {
        var dir = b.getAttribute('data-direction');
        if (ui.draft.direction === dir) return;
        ui.draft.direction = dir;
        // A new direction gets its own default amount unless one was typed in.
        if (dir === 'stop' && Number(ui.draft.amount) === 1) ui.draft.amount = 0;
        if (dir === 'start' && Number(ui.draft.amount) === 0) ui.draft.amount = 1;
        $('amount').value = ui.draft.amount;
        renderEdit();
      });
    });
    document.querySelectorAll('[data-kind]').forEach(function (b) {
      b.addEventListener('click', function () { ui.draft.kind = b.getAttribute('data-kind'); renderEdit(); });
    });
    document.querySelectorAll('[data-day]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = Number(b.getAttribute('data-day')), i = ui.draft.days.indexOf(n);
        if (i === -1) ui.draft.days.push(n); else ui.draft.days.splice(i, 1);
        renderEdit();
      });
    });
    ['action', 'cue', 'identity', 'unit'].forEach(function (id) {
      $(id).addEventListener('input', function () { ui.draft[id] = $(id).value; renderEdit(); });
    });
    ['times', 'every', 'amount'].forEach(function (id) {
      $(id).addEventListener('input', function () { ui.draft[id] = $(id).value === '' ? NaN : $(id).valueAsNumber; renderEdit(); });
    });
    $('save-habit').addEventListener('click', function () {
      var v = validateDraft(ui.draft);
      if (v.error) { $('edit-error').textContent = v.error; return; }
      var h = ui.editId ? habitById(ui.editId) : null;
      if (h) {
        h.direction = v.direction; h.action = v.action; h.cue = v.cue; h.identity = v.identity; h.schedule = v.schedule; h.goal = v.goal;
      } else {
        h = { id: newId(), action: v.action, cue: v.cue, identity: v.identity, direction: v.direction, created: ui.today, archived: null, snoozes: [], schedule: v.schedule, goal: v.goal, log: {} };
        doc.habits.push(h);
      }
      var wasNew = !ui.editId;
      closeScreen('screen-edit');
      commit();
      toast(wasNew ? 'Habit added' : 'Habit saved');
      if (wasNew) setTab(0);
    });
    $('add-habit').addEventListener('click', function () { openEdit(null); });

    // ---- snooze ----

    /** 'Snoozed until 25-Oct-26' or 'Snoozed until turned off': the day the habit is back. */
    function snoozeWords(z) {
      return 'Snoozed until ' + (z.to == null ? 'turned off' : formatDisplayDate(R.addDays(z.to, 1)));
    }
    function renderSnooze() {
      document.querySelectorAll('#snooze-options .option').forEach(function (b) {
        b.setAttribute('aria-checked', b.getAttribute('data-snooze') === ui.snooze ? 'true' : 'false');
      });
      $('snooze-date-card').classList.toggle('hidden', ui.snooze !== 'date');
      var range = R.snoozeRange(ui.snooze, ui.today, $('snooze-date').value);
      $('snooze-confirm').disabled = !range;
      $('snooze-words').textContent = range ? snoozeWords(range) : (ui.snooze === 'date' ? 'Pick a day, tomorrow or later.' : '');
    }
    /** Closes a snooze at yesterday, or removes it when it began today. */
    function endSnooze(h, z) {
      if (z.from >= ui.today) h.snoozes = h.snoozes.filter(function (x) { return x !== z; });
      else z.to = R.addDays(ui.today, -1);
      commit();
      toast('Back on the schedule');
    }
    document.querySelectorAll('#snooze-options .option').forEach(function (b) {
      b.addEventListener('click', function () { ui.snooze = b.getAttribute('data-snooze'); renderSnooze(); });
    });
    $('snooze-date').addEventListener('input', renderSnooze);
    $('snooze-date').addEventListener('change', renderSnooze);
    $('snooze-confirm').addEventListener('click', function () {
      var h = habitById(ui.habitId);
      var range = R.snoozeRange(ui.snooze, ui.today, $('snooze-date').value);
      if (!h || !range) return;
      if (!h.snoozes) h.snoozes = [];
      h.snoozes.push(range);
      closeScreen('screen-snooze');
      commit();
      toast(snoozeWords(range));
    });

    // ---- settings ----

    $('settings-btn').addEventListener('click', function () { $('theme').value = settings.theme; $('palette').value = settings.palette; openScreen('screen-settings'); });
    $('theme').addEventListener('change', function (e) {
      settings.theme = e.target.value;
      save(STORAGE.settings, settings);
      applyTheme();
    });
    $('palette').addEventListener('change', function (e) {
      settings.palette = PALETTES.indexOf(e.target.value) === -1 ? 'pear' : e.target.value;
      save(STORAGE.settings, settings);
      applyTheme();
    });
    $('clear-data').addEventListener('click', function () {
      if (!window.confirm('Clear every habit and check-in from this device? There is no backup yet; this cannot be undone.')) return;
      doc = emptyDocument();
      try { localStorage.removeItem(STORAGE.data); } catch (err) { /* nothing to remove */ }
      closeScreen('screen-habit');
      render();
      toast('Local data cleared');
    });
    $('version').textContent = APP_VERSION;

    // ---- the day turning over ----

    function checkDay() {
      var now = R.localToday();
      if (now !== ui.today) { ui.today = now; render(); }
    }
    setInterval(checkDay, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) checkDay(); });

    // ---- start ----

    applyTheme();
    setTab(0);
    render();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* the app still works online */ });
  })();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    APP_VERSION: APP_VERSION,
    isIsoDate: isIsoDate,
    formatDisplayDate: formatDisplayDate,
    longDate: longDate,
    monthWords: monthWords,
    streakWords: streakWords,
    streakUnit: streakUnit,
    sentenceLine: sentenceLine,
    cycleAmount: cycleAmount,
    percentWords: percentWords,
    controlKind: controlKind,
    emptyDocument: emptyDocument,
    newId: newId,
    blankDraft: blankDraft,
    draftFrom: draftFrom,
    validateDraft: validateDraft,
    withAmount: withAmount,
    monthCells: monthCells,
    daysInMonth: daysInMonth,
    addMonths: addMonths
  };
}
