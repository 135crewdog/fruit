/**
 * Low-Hanging Fruit rules.
 *
 * Pure functions only: no DOM, no storage, no clock. Every date is a local
 * 'YYYY-MM-DD' string and all math is on day numbers, so nothing here can
 * drift across a DST change or a time zone. "Today" is passed in by the
 * caller (the app uses localToday(), the tests use the date each row names).
 *
 * This file is used in two places: loaded by index.html as a plain script,
 * where every top-level function is a global, and by Node for the unit tests
 * via the module.exports at the bottom. The rules themselves are in CLAUDE.md;
 * if the code disagrees with that file's tables, the code is wrong.
 *
 * Vocabulary (CLAUDE.md, "The rules"):
 *   done       a start habit's day at or above its goal, or a stop habit's day
 *              that was logged with slips at or below its limit (a 0 is the mark
 *              for a day with nothing to report);
 *   partial    a start habit's day above 0 and below its goal;
 *   missed     a scheduled day that settled without being done;
 *   unsettled  today, while its outcome is still open.
 */

var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var WEEKDAYS = [1, 2, 3, 4, 5];
var WEEKEND = [0, 6];
var EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/** The device's local calendar date, the one date the app ever reads from a clock. */
function localToday(now) {
  now = now || new Date();
  return now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
}

function isIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromDays(toDays(s)) === s;
}

/** Days since 1970-01-01. UTC is used only as DST-free arithmetic; no instant is ever meant. */
function toDays(iso) {
  var y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function fromDays(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

function addDays(iso, n) { return fromDays(toDays(iso) + n); }

function daysBetween(from, to) { return toDays(to) - toDays(from); }

/** 0 = Sunday … 6 = Saturday. Day 0 (1970-01-01) was a Thursday. */
function weekday(iso) { return ((toDays(iso) % 7) + 7 + 4) % 7; }

/** The Sunday that starts the week containing iso. Weeks run Sunday to Saturday. */
function weekStart(iso) { return addDays(iso, -weekday(iso)); }

/** The first Sunday on or after a habit's creation: where its whole weeks begin. */
function firstWeekStart(habit) {
  var w = weekday(habit.created);
  return w === 0 ? habit.created : addDays(habit.created, 7 - w);
}

/**
 * The last day the habit is reckoned to: today, or the day it was archived. Every
 * figure uses this as its "today", so an archived habit is frozen as it stood that
 * day, an open archive day included.
 */
function lastDay(habit, today) {
  return habit.archived && habit.archived < today ? habit.archived : today;
}

// ---------------------------------------------------------------------------
// A day
// ---------------------------------------------------------------------------

function isStop(habit) { return habit.direction === 'stop'; }

/** A start habit logged with one tap a day: its 0 is the mark for "not today". A count or an amount has no mark. */
function isOnceADay(habit) { return !isStop(habit) && habit.goal.amount === 1 && habit.goal.unit === 'times'; }

/** The snooze covering iso, or null. A snooze is { from, to }, inclusive; to is null for "until turned off". */
function snoozeOn(habit, iso) {
  var list = habit.snoozes || [];
  for (var i = 0; i < list.length; i++) {
    var z = list[i];
    if (z.from <= iso && (z.to == null || iso <= z.to)) return z;
  }
  return null;
}

function isSnoozed(habit, iso) { return snoozeOn(habit, iso) !== null; }

/** A day the habit asks for. A snoozed day asks nothing, whatever the schedule says. */
function isScheduled(habit, iso) {
  if (iso < habit.created) return false;
  if (habit.archived && iso > habit.archived) return false;
  if (isSnoozed(habit, iso)) return false;
  var s = habit.schedule;
  if (s.kind === 'days') return s.days.indexOf(weekday(iso)) !== -1;
  if (s.kind === 'every') return daysBetween(habit.created, iso) % s.days === 0;
  return true; // weekly: every day is a day the week can be met on
}

function amountOn(habit, iso) {
  var a = habit.log ? habit.log[iso] : 0;
  return typeof a === 'number' && isFinite(a) && a > 0 ? a : 0;
}

/** True when the day has an entry at all. A stop habit's 0 is an entry: the day was marked, nothing to report. */
function logged(habit, iso) {
  var a = habit.log ? habit.log[iso] : undefined;
  return typeof a === 'number' && isFinite(a) && a >= 0;
}

/** 'done' | 'partial' | 'missed' | 'unsettled' | 'future'. Says nothing about the schedule. */
function dayState(habit, iso, today) {
  if (iso > today) return 'future';
  var a = amountOn(habit, iso);
  if (isStop(habit)) {
    if (a > habit.goal.amount) return 'missed';
    if (logged(habit, iso)) return 'done';
    return iso === today ? 'unsettled' : 'missed';
  }
  if (a >= habit.goal.amount) return 'done';
  // A once-a-day habit's 0 on today is the mark for "not today": the day settles as missed now rather
  // than at midnight. A count or an amount edited down from once a day has no mark, so a kept 0 is nothing.
  if (iso === today) return a === 0 && logged(habit, iso) && isOnceADay(habit) ? 'missed' : 'unsettled';
  return a > 0 ? 'partial' : 'missed';
}

// ---------------------------------------------------------------------------
// A week (weekly schedules)
// ---------------------------------------------------------------------------

/**
 * 'met' | 'short1' | 'short' | 'unsettled' | 'off' for the week starting ws.
 * Met once N settled days are done; short once the days not yet missed number
 * fewer than N (short1 when exactly N-1 are done); unsettled until one of those.
 * Snoozed days are left out of the week, and a week with fewer days left than N
 * is off: it drops out of every figure, as a snoozed day does.
 */
function weekStatus(habit, ws, today) {
  var need = habit.schedule.times, done = 0, open = 0, snoozed = 0;
  for (var i = 0; i < 7; i++) {
    var d = addDays(ws, i);
    if (d < habit.created) continue;
    if (habit.archived && d > habit.archived) continue;
    if (isSnoozed(habit, d)) { snoozed++; continue; }
    var st = dayState(habit, d, today);
    if (st === 'done') done++;
    else if (st === 'unsettled' || st === 'future') open++;
  }
  if (7 - snoozed < need) return 'off';
  if (done >= need) return 'met';
  if (done + open < need) return done === need - 1 ? 'short1' : 'short';
  return 'unsettled';
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

/** Done scheduled days counting back from today, forgiving one miss unless the one before was missed too. */
function dayStreak(habit, today) {
  var n = 0, prevMissed = false, end = lastDay(habit, today);
  for (var d = end; d >= habit.created; d = addDays(d, -1)) {
    if (!isScheduled(habit, d)) continue;
    var st = dayState(habit, d, end);
    if (st === 'unsettled') continue;
    if (st === 'done') { n++; prevMissed = false; }
    else { if (prevMissed) break; prevMissed = true; }
  }
  return n;
}

/** Met weeks counting back from the current week, forgiving one week short by one unless the one before fell short too. */
function weekStreak(habit, today) {
  var n = 0, prevShort = false, first = firstWeekStart(habit), end = lastDay(habit, today);
  for (var ws = weekStart(end); ws >= first; ws = addDays(ws, -7)) {
    var st = weekStatus(habit, ws, end);
    if (st === 'unsettled' || st === 'off') continue;
    if (st === 'met') { n++; prevShort = false; }
    else if (st === 'short1') { if (prevShort) break; prevShort = true; }
    else break;
  }
  return n;
}

function currentStreak(habit, today) {
  return habit.schedule.kind === 'weekly' ? weekStreak(habit, today) : dayStreak(habit, today);
}

/**
 * The longest value currentStreak has ever had. One forward pass carrying the
 * same run and forgiveness as the walk back: a done unit adds one, a first miss
 * is carried, a second miss in a row (or a week short by two) resets. A unit that
 * is still unsettled is skipped, as the walk back skips it.
 */
function bestStreak(habit, today) {
  var end = lastDay(habit, today), best = 0, run = 0, prevMissed = false;
  function step(st, forgivable) {
    if (st === 'unsettled' || st === 'off') return;
    if (st === 'done' || st === 'met') { run++; prevMissed = false; }
    else if (forgivable) { if (prevMissed) run = 0; prevMissed = true; }
    else { run = 0; prevMissed = false; }
    if (run > best) best = run;
  }
  if (habit.schedule.kind === 'weekly') {
    for (var ws = firstWeekStart(habit), last = weekStart(end); ws <= last; ws = addDays(ws, 7)) {
      var w = weekStatus(habit, ws, end);
      step(w, w === 'short1');
    }
  } else {
    for (var d = habit.created; d <= end; d = addDays(d, 1)) {
      if (isScheduled(habit, d)) step(dayState(habit, d, end), true);
    }
  }
  return best;
}

/**
 * { done, scheduled } over settled scheduled days (or settled whole weeks),
 * or null when there is nothing to count yet. The rate is done / scheduled.
 */
function completion(habit, today) {
  var done = 0, scheduled = 0, end = lastDay(habit, today);
  if (habit.schedule.kind === 'weekly') {
    for (var ws = firstWeekStart(habit), current = weekStart(end); ws < current; ws = addDays(ws, 7)) {
      var w = weekStatus(habit, ws, end);
      if (w === 'off') continue;
      scheduled++;
      if (w === 'met') done++;
    }
  } else {
    for (var d = habit.created; d <= end; d = addDays(d, 1)) {
      if (!isScheduled(habit, d)) continue;
      var st = dayState(habit, d, end);
      if (st === 'unsettled') continue;
      scheduled++;
      if (st === 'done') done++;
    }
  }
  return scheduled ? { done: done, scheduled: scheduled } : null;
}

/**
 * Done days since created, scheduled or not, for a start habit (a bonus day
 * counts here and nowhere else). For a stop habit, scheduled days within the limit: there
 * is no bonus for a day on which nothing was asked.
 */
function total(habit, today) {
  var n = 0, stop = isStop(habit), end = lastDay(habit, today);
  for (var d = habit.created; d <= end; d = addDays(d, 1)) {
    if (stop && !isScheduled(habit, d)) continue;
    if (dayState(habit, d, end) === 'done') n++;
  }
  return n;
}

/** The four figures the Habit screen shows. */
function figures(habit, today) {
  return {
    streak: currentStreak(habit, today),
    best: bestStreak(habit, today),
    completion: completion(habit, today),
    total: total(habit, today)
  };
}

/**
 * True while the streak is carrying a forgiven miss: the most recent settled
 * scheduled day (or whole week) was missed (or one short) and the one before it
 * was not, so the next miss ends the streak. Drives "Don't miss twice".
 */
function forgiven(habit, today) {
  var end = lastDay(habit, today);
  if (habit.schedule.kind === 'weekly') {
    var last = null, before = null;
    for (var ws = weekStart(end); ws >= firstWeekStart(habit); ws = addDays(ws, -7)) {
      var st = weekStatus(habit, ws, end);
      if (st === 'unsettled' || st === 'off') continue;
      if (last === null) last = st; else { before = st; break; }
    }
    return last === 'short1' && before !== 'short1' && before !== 'short';
  }
  var lastSt = null, beforeSt = null;
  for (var d = end; d >= habit.created; d = addDays(d, -1)) {
    if (!isScheduled(habit, d)) continue;
    var s = dayState(habit, d, end);
    if (s === 'unsettled') continue;
    if (lastSt === null) lastSt = s; else { beforeSt = s; break; }
  }
  return lastSt !== null && lastSt !== 'done' && (beforeSt === 'done' || beforeSt === null);
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

function sameDays(a, b) {
  if (a.length !== b.length) return false;
  var x = a.slice().sort(), y = b.slice().sort();
  for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

function amountWords(amount, unit) { return amount + ' ' + unit; }

/** One phrase for a habit's schedule and goal, per the "Schedule in words" table. */
function scheduleWords(habit) {
  var s = habit.schedule, stop = isStop(habit), base, properNoun = false;
  if (s.kind === 'days') {
    if (sameDays(s.days, EVERY_DAY)) base = 'Every day';
    else if (sameDays(s.days, WEEKDAYS)) base = 'Weekdays';
    else if (sameDays(s.days, WEEKEND)) base = 'Weekends';
    else {
      base = s.days.slice().sort().map(function (d) { return DAY_NAMES[d]; }).join(', ');
      properNoun = true;
    }
  } else if (s.kind === 'weekly') {
    if (stop) base = s.times + ' day' + (s.times === 1 ? '' : 's') + ' a week';
    else base = s.times === 1 ? 'Once a week' : s.times + ' times a week';
  } else {
    base = s.days === 1 ? 'Every day' : s.days === 2 ? 'Every other day' : 'Every ' + s.days + ' days';
  }
  var lower = properNoun ? base : base.charAt(0).toLowerCase() + base.slice(1);
  if (stop) {
    return habit.goal.amount > 0 ? 'Up to ' + amountWords(habit.goal.amount, habit.goal.unit) + ' a day, ' + lower : base;
  }
  return habit.goal.amount > 1 ? amountWords(habit.goal.amount, habit.goal.unit) + ' a day, ' + lower : base;
}

/**
 * The Snooze sheet's choice as { from, to }, starting today: 'tomorrow' covers today only,
 * 'week' is back on this weekday next week, 'month' back on this date next month (or the last
 * day of it), 'date' runs through the day before the picked date (tomorrow or later), 'off' is
 * open-ended. Null when the choice or the date cannot be read.
 */
function snoozeRange(choice, today, date) {
  if (choice === 'tomorrow') return { from: today, to: today };
  if (choice === 'week') return { from: today, to: addDays(today, 6) };
  if (choice === 'off') return { from: today, to: null };
  if (choice === 'date') return isIsoDate(date) && date > today ? { from: today, to: addDays(date, -1) } : null;
  if (choice === 'month') {
    var y = +today.slice(0, 4), m = +today.slice(5, 7), d = +today.slice(8, 10);
    if (++m > 12) { m = 1; y++; }
    var days = new Date(Date.UTC(y, m, 0)).getUTCDate(); // last day of month m
    return { from: today, to: addDays(y + '-' + pad2(m) + '-' + pad2(Math.min(d, days)), -1) };
  }
  return null;
}

/** "Become a morning person": the identity leads every list row. */
function identityWords(habit) {
  return ('Become ' + habit.identity).replace(/\s+/g, ' ').trim();
}

/** "wake up before 6 a.m." or "not drink alcohol on a weeknight": what the day asks, in gray beneath. */
function actionWords(habit) {
  var parts = isStop(habit) ? ['not', habit.action] : [habit.action];
  if (habit.cue) parts.push(habit.cue);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** "I will get out of bed before 6 a.m. so that I can become a morning person." */
function statement(habit) {
  var parts = ['I will' + (isStop(habit) ? ' not' : ''), habit.action];
  if (habit.cue) parts.push(habit.cue);
  parts.push('so that I can become', habit.identity);
  return parts.join(' ').replace(/\s+/g, ' ').trim() + '.';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DAY_NAMES: DAY_NAMES,
    localToday: localToday,
    isIsoDate: isIsoDate,
    addDays: addDays,
    daysBetween: daysBetween,
    weekday: weekday,
    weekStart: weekStart,
    firstWeekStart: firstWeekStart,
    isScheduled: isScheduled,
    isOnceADay: isOnceADay,
    snoozeOn: snoozeOn,
    isSnoozed: isSnoozed,
    snoozeRange: snoozeRange,
    logged: logged,
    dayState: dayState,
    weekStatus: weekStatus,
    currentStreak: currentStreak,
    bestStreak: bestStreak,
    completion: completion,
    total: total,
    figures: figures,
    forgiven: forgiven,
    scheduleWords: scheduleWords,
    identityWords: identityWords,
    actionWords: actionWords,
    statement: statement
  };
}
