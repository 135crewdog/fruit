'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const rules = require('../app/rules.js');

// ---------------------------------------------------------------------------
// Required test cases (copied from CLAUDE.md line for line; do not edit values)
// ---------------------------------------------------------------------------

// | # | Habit | Log | Current streak | Best streak | Completion | Total |
const ROWS = [
  '| 1 | weekdays, created 2026-10-01 | Oct 12, 13, 14, 15, 16 | 5 | 5 | 5/12 | 5 |',
  '| 2 | weekdays, created 2026-10-01, today 2026-10-16 (Fri), Oct 16 not yet logged | Oct 12, 13, 14, 15 | 4 | 4 | 4/11 | 4 |',
  '| 3 | weekdays, created 2026-10-01, today 2026-10-16 (Fri) | Oct 12, 13, 14, 15, 16 | 5 | 5 | 5/12 | 5 |',
  '| 4 | weekdays, created 2026-10-01, today 2026-10-16 (Fri), Oct 16 not yet logged | Oct 12, 13, 14 | 3 | 3 | 3/11 | 3 |',
  '| 5 | weekdays, created 2026-10-01, today 2026-10-16 (Fri) | Oct 12, 13, 14, 16 | 4 | 4 | 4/12 | 4 |',
  '| 6 | weekdays, created 2026-10-01 | Oct 10 (Sat), 12, 13, 14, 15, 16 | 5 | 5 | 5/12 | 6 |',
  '| 7 | weekdays, created 2026-10-01 | Oct 1, 2, 5, 6, 7, 12, 13 | 0 | 5 | 7/12 | 7 |',
  '| 8 | weekdays, created 2026-10-17 (today) | none | 0 | 0 | blank | 0 |',
  '| 9 | weekdays, goal 8 times, created 2026-10-12 | Oct 12: 8, 13: 8, 14: 8, 15: 8, 16: 5 (partial) | 4 | 4 | 4/5 | 4 |',
  '| 10 | weekdays, created 2026-10-01, archived 2026-10-10 | Oct 1, 2, 5, 6, 7, 8, 9 | 7 | 7 | 7/7 | 7 |',
  '| 11 | every 3 days, created 2026-09-28 | Oct 1, 4, 7, 10, 13, 16 | 6 | 6 | 6/7 | 6 |',
  '| 12 | every 3 days, created 2026-09-28 | Sep 28, Oct 1, 4, 7, 10, 13, 16 | 7 | 7 | 7/7 | 7 |',
  '| 13 | every 3 days, created 2026-09-28 | Sep 28, Oct 1, 4, 10, 13, 16 | 6 | 6 | 6/7 | 6 |',
  '| 14 | 3 per week, created 2026-09-27 | Sep 28, 30, Oct 2, 5, 7, 9, 12, 14 | 2 | 2 | 2/2 | 8 |',
  '| 15 | 3 per week, created 2026-09-27 | Sep 28, 30, Oct 2, 5, 7, 9, 12, 14, 16 | 3 | 3 | 2/2 | 9 |',
  '| 16 | 3 per week, created 2026-09-27 | Sep 28, 30, Oct 2, 5, 7, 12, 14, 16 | 2 | 2 | 1/2 | 8 |',
  '| 17 | 3 per week, created 2026-09-27 | Sep 28, 30, Oct 2, 5, 7, 12, 14 | 1 | 1 | 1/2 | 7 |',
  '| 18 | 3 per week, created 2026-10-11 (this Sunday) | Oct 12, 14, 16 | 1 | 1 | blank | 3 |',
  '| 19 | stop, every day, limit 0, created 2026-10-01 | marked Oct 1–4, 6–9, 11–16; slips Oct 5, 10 | 14 | 14 | 14/16 | 14 |',
  '| 20 | stop, every day, limit 0, created 2026-10-01 | marked Oct 1–4, 6–9, 11–16; slips Oct 5, 10, 17 (today) | 14 | 14 | 14/17 | 14 |',
  '| 21 | stop, weekdays, limit 2 drinks, created 2026-10-12 | Oct 12: 1, 13: 3, 14: 2, 15: 0, 16: 2 | 4 | 4 | 4/5 | 4 |',
  '| 22 | stop, 5 days a week, limit 0, created 2026-09-27 | marked Sep 27, 28, 30, Oct 1, 2, 4, 5, 9, 10, 11, 13, 14, 15, 16; slips Sep 29, Oct 3, 6, 7, 8, 12 | 2 | 2 | 1/2 | 14 |',
  '| 23 | 3 per week, created 2026-09-20 | Sep 21, 23, 25, 28, 30, Oct 5, 7, 12, 14, 16 | 1 | 1 | 1/3 | 10 |',
  '| 24 | 3 per week, created 2026-09-27 | Sep 28, 30, Oct 2, 7, 12, 14, 16 | 1 | 1 | 1/2 | 7 |',
  '| 25 | stop, every day, limit 0, created 2026-10-01 | marked Oct 1–14; slips Oct 15, 16 | 0 | 14 | 14/16 | 14 |',
  '| 26 | 5 per week, created 2026-09-27 | Sep 28, 29, 30, Oct 1, 2, 5, 6, 7, 8, 9, 12 | 0 | 2 | 2/2 | 11 |',
  '| 27 | 3 per week, created 2026-09-20 | Sep 21, 23, 25, 28, 30, Oct 5, 7, 12, 14 | 0 | 1 | 1/3 | 9 |',
  '| 28 | stop, every day, limit 0, created 2026-10-01 | marked Oct 1–13; nothing logged Oct 14–16 | 0 | 13 | 13/16 | 13 |',
  '| 29 | stop, every day, limit 0, created 2026-10-01 | marked Oct 1–14, 16; nothing logged Oct 15 | 15 | 15 | 15/16 | 15 |',
  '| 30 | weekdays, created 2026-10-01, snoozed Oct 12–13 | Oct 1, 2, 5, 6, 7, 8, 9, 14, 15, 16 | 10 | 10 | 10/10 | 10 |',
  '| 31 | weekdays, created 2026-10-01, snoozed Oct 12–16 | Oct 1, 2, 5, 6, 7, 8, 9, 14 | 7 | 7 | 7/7 | 8 |',
  '| 32 | stop, every day, limit 0, created 2026-10-01, snoozed Oct 10–11 | marked Oct 1–9, 12–16 | 14 | 14 | 14/14 | 14 |',
  '| 33 | 3 per week, created 2026-09-27, snoozed Oct 4–10 | Sep 28, 30, Oct 2, 12, 14, 16 | 2 | 2 | 1/1 | 6 |',
  '| 34 | 3 per week, created 2026-09-27, snoozed Oct 8–10 | Sep 28, 30, Oct 2, 5, 12, 14, 16 | 1 | 1 | 1/2 | 7 |',
  '| 35 | 5 per week, created 2026-09-27, snoozed Oct 8–10 | Sep 28, 29, 30, Oct 1, 2, 5, 6, 12, 13, 14, 15, 16 | 2 | 2 | 1/1 | 12 |',
  '| 36 | weekdays, created 2026-10-01, snoozed from Oct 12 | Oct 1, 2, 5, 6, 7, 8, 9 | 7 | 7 | 7/7 | 7 |',
  '| 37 | weekdays, created 2026-10-01, today 2026-10-16 (Fri) | Oct 12, 13, 14, 15, 16: 0 (not done) | 4 | 4 | 4/12 | 4 |'
];

const DEFAULT_TODAY = '2026-10-17'; // a Saturday
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

/** Turns a table row into a habit, the day it is reckoned on, and the expected figures. */
function parseRow(row) {
  const cells = row.split('|').slice(1, -1).map((c) => c.trim());
  const [n, desc, log, streak, best, completionText, totalText] = cells;
  const habit = {
    id: 'row' + n, action: 'test', cue: '', identity: 'tested', direction: 'start',
    created: null, archived: null, snoozes: [], schedule: null, goal: { amount: 1, unit: 'times' }, log: {}
  };
  let today = DEFAULT_TODAY, m;
  for (const token of desc.split(', ')) {
    if (token === 'stop') { habit.direction = 'stop'; habit.goal.amount = 0; }
    else if (token === 'weekdays') habit.schedule = { kind: 'days', days: [1, 2, 3, 4, 5] };
    else if (token === 'every day') habit.schedule = { kind: 'days', days: [0, 1, 2, 3, 4, 5, 6] };
    else if ((m = /^every (\d+) days$/.exec(token))) habit.schedule = { kind: 'every', days: +m[1] };
    else if ((m = /^(\d+) per week$/.exec(token)) || (m = /^(\d+) days a week$/.exec(token))) habit.schedule = { kind: 'weekly', times: +m[1] };
    else if ((m = /^goal (\d+) (\w+)$/.exec(token))) habit.goal = { amount: +m[1], unit: m[2] };
    else if ((m = /^limit (\d+)(?: (\w+))?$/.exec(token))) habit.goal = { amount: +m[1], unit: m[2] || 'times' };
    else if ((m = /^created (\S+)/.exec(token))) habit.created = m[1];
    else if ((m = /^archived (\S+)/.exec(token))) habit.archived = m[1];
    else if ((m = /^today (\S+)/.exec(token))) today = m[1];
    else if ((m = /^snoozed (from )?([A-Z][a-z]{2}) (\d+)(?:–(\d+))?$/.exec(token))) {
      const day = (d) => '2026-' + String(MONTHS[m[2]]).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      habit.snoozes.push({ from: day(+m[3]), to: m[1] ? null : day(+(m[4] || m[3])) });
    }
    else if (/not yet logged$/.test(token)) { /* says only that today is open */ }
    else throw new Error('row ' + n + ': cannot read "' + token + '"');
  }
  if (log !== 'none') {
    // A logged day is done (amount at goal) unless an amount is given; a slip is one over the limit;
    // "marked" days carry 0, the mark; "nothing logged" days are left out. Ranges run Oct 1–4.
    const fallback = habit.direction === 'stop' ? habit.goal.amount + 1 : habit.goal.amount;
    for (const segment of log.split('; ')) {
      let kind = 'default', items = segment, k;
      if ((k = /^(marked|slips|nothing logged) (.*)$/.exec(segment))) { kind = k[1]; items = k[2]; }
      let month = null;
      for (const item of items.split(', ')) {
        m = /^(?:([A-Z][a-z]{2}) )?(\d+)(?:–(\d+))?(?:: (\d+))?(?: \([^)]*\))?$/.exec(item);
        if (!m) throw new Error('row ' + n + ': cannot read log item "' + item + '"');
        if (m[1]) month = MONTHS[m[1]];
        for (let d = +m[2], last = m[3] ? +m[3] : +m[2]; d <= last; d++) {
          const key = '2026-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
          if (kind === 'nothing logged') continue;
          habit.log[key] = m[4] != null ? +m[4] : kind === 'marked' ? 0 : fallback;
        }
      }
    }
  }
  return { n: +n, habit, today, expect: { streak: +streak, best: +best, completion: completionText, total: +totalText } };
}

function completionText(c) { return c ? c.done + '/' + c.scheduled : 'blank'; }

for (const row of ROWS) {
  const { n, habit, today, expect } = parseRow(row);
  test('row ' + n + ': ' + row.split('|')[2].trim(), () => {
    const f = rules.figures(habit, today);
    assert.deepEqual(
      { streak: f.streak, best: f.best, completion: completionText(f.completion), total: f.total },
      expect
    );
  });
}

test('the rows above are the rows in CLAUDE.md, line for line', () => {
  const spec = fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8').split('\n');
  const inSpec = spec.filter((line) => /^\| \d+ \| /.test(line) && /\| (blank|\d+\/\d+) \| \d+ \|$/.test(line));
  assert.deepEqual(inSpec, ROWS);
});

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

test('weekday and weekStart follow the iPhone calendar, Sunday first', () => {
  assert.equal(rules.weekday('2026-10-17'), 6); // Saturday
  assert.equal(rules.weekday('2026-10-11'), 0); // Sunday
  assert.equal(rules.weekday('2026-10-01'), 4); // Thursday
  assert.equal(rules.weekStart('2026-10-17'), '2026-10-11');
  assert.equal(rules.weekStart('2026-10-11'), '2026-10-11');
});

test('addDays crosses month and year ends on numbers', () => {
  assert.equal(rules.addDays('2026-09-28', 3), '2026-10-01');
  assert.equal(rules.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(rules.addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(rules.daysBetween('2026-09-28', '2026-10-16'), 18);
});

test('localToday reads the local calendar, not UTC', () => {
  // 23:30 local on the 17th is the 18th in UTC for anyone west of Greenwich; the local date must win.
  const late = new Date(2026, 9, 17, 23, 30);
  assert.equal(rules.localToday(late), '2026-10-17');
  assert.equal(rules.isIsoDate('2026-02-29'), false);
  assert.equal(rules.isIsoDate('2028-02-29'), true);
  assert.equal(rules.isIsoDate('17-Oct-26'), false);
});

test('firstWeekStart is the first Sunday on or after created', () => {
  const h = (created) => ({ created, schedule: { kind: 'weekly', times: 3 }, goal: { amount: 1 }, log: {} });
  assert.equal(rules.firstWeekStart(h('2026-10-11')), '2026-10-11');
  assert.equal(rules.firstWeekStart(h('2026-10-14')), '2026-10-18');
});

// ---------------------------------------------------------------------------
// Forgiveness hint
// ---------------------------------------------------------------------------

test('forgiven is true only while a streak is carrying one forgiven miss', () => {
  const byNumber = Object.fromEntries(ROWS.map(parseRow).map((r) => [r.n, r]));
  const check = (n, expected) => assert.equal(rules.forgiven(byNumber[n].habit, byNumber[n].today), expected, 'row ' + n);
  check(1, false);  // nothing missed
  check(4, true);   // Thursday missed, Friday open
  check(7, false);  // two misses in a row: nothing left to forgive
  check(17, true);  // last week one short, this week open
  check(23, false); // two short weeks in a row
  check(20, true);  // a slip today, yesterday within the limit
  check(28, false); // two days unopened in a row
  check(29, false); // one day forgotten and already recovered from: nothing left to carry
});

// ---------------------------------------------------------------------------
// Archiving and age
// ---------------------------------------------------------------------------

test('an archived habit is frozen as it stood on the archive day, an open day included', () => {
  const start = {
    direction: 'start', created: '2026-10-01', archived: '2026-10-16',
    schedule: { kind: 'days', days: [1, 2, 3, 4, 5] }, goal: { amount: 1, unit: 'times' },
    log: { '2026-10-12': 1, '2026-10-13': 1, '2026-10-14': 1, '2026-10-15': 1 }
  };
  const stop = { ...start, direction: 'stop', goal: { amount: 0, unit: 'times' }, log: { '2026-10-12': 0, '2026-10-13': 1, '2026-10-14': 0, '2026-10-15': 0 } };
  for (const habit of [start, stop]) {
    const onTheDay = rules.figures(habit, '2026-10-16'); // Friday the 16th still open when archived
    assert.deepEqual(rules.figures(habit, '2026-10-17'), onTheDay);
    assert.deepEqual(rules.figures(habit, '2027-03-01'), onTheDay);
    assert.equal(rules.forgiven(habit, '2027-03-01'), rules.forgiven(habit, '2026-10-16'));
  }
  assert.deepEqual(rules.figures(start, '2027-03-01'), { streak: 4, best: 4, completion: { done: 4, scheduled: 11 }, total: 4 });
});

test('figures for a six-year daily habit come back fast enough for a tap', () => {
  const log = {};
  for (let d = '2020-10-17'; d <= '2026-10-16'; d = rules.addDays(d, 1)) log[d] = 1;
  const habit = {
    direction: 'start', created: '2020-10-17', archived: null,
    schedule: { kind: 'days', days: [0, 1, 2, 3, 4, 5, 6] }, goal: { amount: 1, unit: 'times' }, log
  };
  const marked = {};
  for (const d of Object.keys(log)) marked[d] = 0; // every day marked, nothing to report
  const stop = { ...habit, direction: 'stop', goal: { amount: 0, unit: 'times' }, log: marked };
  const t0 = process.hrtime.bigint();
  const f = rules.figures(habit, '2026-10-17');
  const g = rules.figures(stop, '2026-10-17');
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(f.streak, 2191);
  assert.equal(f.best, 2191);
  assert.equal(g.total, 2191);
  assert.ok(ms < 500, 'took ' + ms.toFixed(0) + ' ms');
});

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

test('scheduleWords follows the "Schedule in words" table', () => {
  const w = (schedule, goal, direction) => rules.scheduleWords({ schedule, goal: goal || { amount: 1, unit: 'times' }, direction: direction || 'start' });
  assert.equal(w({ kind: 'days', days: [0, 1, 2, 3, 4, 5, 6] }), 'Every day');
  assert.equal(w({ kind: 'days', days: [1, 2, 3, 4, 5] }), 'Weekdays');
  assert.equal(w({ kind: 'days', days: [6, 0] }), 'Weekends');
  assert.equal(w({ kind: 'days', days: [5, 1, 3] }), 'Mon, Wed, Fri');
  assert.equal(w({ kind: 'weekly', times: 3 }), '3 times a week');
  assert.equal(w({ kind: 'weekly', times: 1 }), 'Once a week');
  assert.equal(w({ kind: 'every', days: 3 }), 'Every 3 days');
  assert.equal(w({ kind: 'every', days: 2 }), 'Every other day');
  assert.equal(w({ kind: 'every', days: 1 }), 'Every day');
  assert.equal(w({ kind: 'days', days: [1, 2, 3, 4, 5] }, { amount: 8, unit: 'times' }), '8 times a day, weekdays');
  assert.equal(w({ kind: 'every', days: 3 }, { amount: 2, unit: 'miles' }), '2 miles a day, every 3 days');
  assert.equal(w({ kind: 'weekly', times: 3 }, { amount: 64, unit: 'oz' }), '64 oz a day, 3 times a week');
  assert.equal(w({ kind: 'days', days: [5, 1, 3] }, { amount: 2, unit: 'miles' }), '2 miles a day, Mon, Wed, Fri');
  assert.equal(w({ kind: 'days', days: [1, 2, 3, 4, 5] }, { amount: 0, unit: 'times' }, 'stop'), 'Weekdays');
  assert.equal(w({ kind: 'days', days: [1, 2, 3, 4, 5] }, { amount: 2, unit: 'drinks' }, 'stop'), 'Up to 2 drinks a day, weekdays');
  assert.equal(w({ kind: 'weekly', times: 5 }, { amount: 0, unit: 'times' }, 'stop'), '5 days a week');
});

test('a kept 0 is the not-today mark only on a once-a-day habit', () => {
  const t = '2026-10-17';
  const base = { created: '2026-10-01', archived: null, direction: 'start', schedule: { kind: 'days', days: [0, 1, 2, 3, 4, 5, 6] }, log: { [t]: 0 } };
  assert.equal(rules.dayState({ ...base, goal: { amount: 1, unit: 'times' } }, t, t), 'missed', 'once a day: marked not today');
  assert.equal(rules.dayState({ ...base, goal: { amount: 8, unit: 'times' } }, t, t), 'unsettled', 'a count edited from once a day: the 0 means nothing');
  assert.equal(rules.dayState({ ...base, goal: { amount: 2, unit: 'miles' } }, t, t), 'unsettled', 'an amount: the 0 means nothing');
  assert.equal(rules.dayState({ ...base, goal: { amount: 1, unit: 'times' } }, '2026-10-10', t), 'missed', 'a past 0 is a missed day like a blank');
});

test('snoozeRange turns the sheet\'s choice into a range starting today', () => {
  const t = '2026-10-17'; // a Saturday
  assert.deepEqual(rules.snoozeRange('tomorrow', t), { from: t, to: '2026-10-17' });
  assert.deepEqual(rules.snoozeRange('week', t), { from: t, to: '2026-10-23' }); // back on Saturday the 24th
  assert.deepEqual(rules.snoozeRange('month', t), { from: t, to: '2026-11-16' }); // back on the 17th
  assert.deepEqual(rules.snoozeRange('month', '2026-01-31'), { from: '2026-01-31', to: '2026-02-27' }); // back on the last day of February
  assert.deepEqual(rules.snoozeRange('month', '2026-12-05'), { from: '2026-12-05', to: '2027-01-04' });
  assert.deepEqual(rules.snoozeRange('date', t, '2026-10-25'), { from: t, to: '2026-10-24' });
  assert.equal(rules.snoozeRange('date', t, '2026-10-17'), null);
  assert.equal(rules.snoozeRange('date', t, ''), null);
  assert.deepEqual(rules.snoozeRange('off', t), { from: t, to: null });
  assert.equal(rules.snoozeRange('never', t), null);
  // The range it makes is what the rules read: a snoozed day is not scheduled.
  const h = { created: '2026-10-01', archived: null, direction: 'start', schedule: { kind: 'days', days: [0, 1, 2, 3, 4, 5, 6] }, goal: { amount: 1, unit: 'times' }, log: {}, snoozes: [rules.snoozeRange('week', t)] };
  assert.equal(rules.isScheduled(h, '2026-10-23'), false);
  assert.equal(rules.isScheduled(h, '2026-10-24'), true);
  assert.equal(rules.snoozeOn(h, '2026-10-20').to, '2026-10-23');
  assert.equal(rules.snoozeOn(h, '2026-10-16'), null);
});

test('identityWords and actionWords split the statement for a list row', () => {
  const start = { direction: 'start', action: 'wake up', cue: 'before 6 a.m.', identity: 'a morning person' };
  const stop = { direction: 'stop', action: 'drink alcohol', cue: 'on a weeknight', identity: 'a clear-headed person' };
  assert.equal(rules.identityWords(start), 'Become a morning person');
  assert.equal(rules.actionWords(start), 'wake up before 6 a.m.');
  assert.equal(rules.identityWords(stop), 'Become a clear-headed person');
  assert.equal(rules.actionWords(stop), 'not drink alcohol on a weeknight');
  assert.equal(rules.actionWords({ direction: 'start', action: 'floss', cue: '', identity: 'x' }), 'floss');
});

test('statement assembles the sentence for both directions', () => {
  assert.equal(
    rules.statement({ direction: 'start', action: 'get out of bed', cue: 'before 6 a.m.', identity: 'a morning person' }),
    'I will get out of bed before 6 a.m. so that I can become a morning person.'
  );
  assert.equal(
    rules.statement({ direction: 'stop', action: 'drink more than two beers', cue: 'on a weeknight', identity: 'a clear-headed person' }),
    'I will not drink more than two beers on a weeknight so that I can become a clear-headed person.'
  );
  assert.equal(
    rules.statement({ direction: 'start', action: 'floss', cue: '', identity: 'someone who keeps their teeth' }),
    'I will floss so that I can become someone who keeps their teeth.'
  );
});
