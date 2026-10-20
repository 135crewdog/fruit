'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app/app.js');

test('dates read as DD-Mmm-YY, with the weekday on the Today title', () => {
  assert.equal(app.formatDisplayDate('2026-10-17'), '17-Oct-26');
  assert.equal(app.formatDisplayDate(''), '');
  assert.equal(app.formatDisplayDate('not a date'), 'not a date');
  assert.equal(app.longDate('2026-10-17', 6), 'Saturday 17-Oct-26');
  assert.equal(app.monthWords('2026-10'), 'Oct 2026');
});

test('streak and percent words', () => {
  const days = { schedule: { kind: 'days', days: [1] } };
  const weekly = { schedule: { kind: 'weekly', times: 3 } };
  assert.equal(app.streakWords(days, 10), '10-day streak');
  assert.equal(app.streakWords(days, 1), '1-day streak');
  assert.equal(app.streakWords(days, 0), 'No streak');
  assert.equal(app.streakWords(weekly, 3), '3-week streak');
  assert.equal(app.streakWords(weekly, 1), '1-week streak');
  assert.equal(app.streakUnit(days, 1), 'day');
  assert.equal(app.streakUnit(days, 0), 'days');
  assert.equal(app.streakUnit(weekly, 3), 'weeks');
  assert.equal(app.percentWords({ done: 5, scheduled: 12 }), '42%');
  assert.equal(app.percentWords({ done: 2, scheduled: 2 }), '100%');
  assert.equal(app.percentWords(null), '');
});

test('sentenceLine makes one sentence-case line, keeping day names and dates', () => {
  assert.equal(app.sentenceLine(['get out of bed before 6 a.m.', 'Weekdays', 'Snoozed until turned off']), 'Get out of bed before 6 a.m. · weekdays · snoozed until turned off');
  assert.equal(app.sentenceLine(['not view pornography', 'Every day']), 'Not view pornography · every day');
  assert.equal(app.sentenceLine(['exercise', '4 times a week', '', '3-day streak']), 'Exercise · 4 times a week · 3-day streak');
  assert.equal(app.sentenceLine(['run', 'Mon, Wed, Fri', 'Snoozed until 25-Oct-26']), 'Run · Mon, Wed, Fri · snoozed until 25-Oct-26');
  assert.equal(app.sentenceLine(['floss']), 'Floss');
  assert.equal(app.sentenceLine(['iPhone detox', 'Every day']), 'iPhone detox · every day', 'a first word with a capital inside it is left as typed');
  assert.equal(app.sentenceLine(['read', 'eBay break']), 'Read · eBay break');
});

test('the control follows the goal: check, count, amount, slips', () => {
  const h = (direction, amount, unit) => ({ direction, goal: { amount, unit } });
  assert.equal(app.controlKind(h('start', 1, 'times')), 'check');
  assert.equal(app.controlKind(h('start', 8, 'times')), 'count');
  assert.equal(app.controlKind(h('start', 1, 'miles')), 'amount');
  assert.equal(app.controlKind(h('start', 64, 'oz')), 'amount');
  assert.equal(app.controlKind(h('stop', 0, 'times')), 'check', 'a limit of 0 is the same pill as once a day');
  assert.equal(app.controlKind(h('stop', 2, 'drinks')), 'slips');
});

test('the once-a-day pill cycles ring, check, cross, ring', () => {
  const start = { direction: 'start' }, stop = { direction: 'stop' };
  // start, today: nothing → done → not today (a kept 0) → nothing
  assert.equal(app.cycleAmount(start, 0, false, true), 1);
  assert.equal(app.cycleAmount(start, 1, true, true), 0);
  assert.ok(Number.isNaN(app.cycleAmount(start, 0, true, true)));
  // start, a past day: done ↔ nothing; a past 0 and a past blank are the same missed day, so either goes to done in one tap
  assert.ok(Number.isNaN(app.cycleAmount(start, 1, true, false)));
  assert.equal(app.cycleAmount(start, 0, false, false), 1);
  assert.equal(app.cycleAmount(start, 0, true, false), 1);
  // stop, limit 0: nothing → marked → slipped → nothing, today or not
  assert.equal(app.cycleAmount(stop, 0, false, true), 0);
  assert.equal(app.cycleAmount(stop, 0, true, true), 1);
  assert.ok(Number.isNaN(app.cycleAmount(stop, 1, true, false)));
});

test('validateDraft names the first problem, in order', () => {
  const ok = app.blankDraft();
  ok.action = 'floss'; ok.identity = 'someone who keeps their teeth';
  assert.equal(app.validateDraft({ ...ok, action: ' ' }).error, 'Say what you will do.');
  assert.equal(app.validateDraft({ ...ok, action: 'x', direction: 'stop' , identity: ''}).error, 'Say who you want to become.');
  assert.equal(app.validateDraft({ ...ok, direction: 'stop', action: '' }).error, 'Say what you will not do.');
  assert.equal(app.validateDraft({ ...ok, days: [] }).error, 'Pick at least one day.');
  assert.equal(app.validateDraft({ ...ok, kind: 'weekly', times: 8 }).error, 'Days a week must be a whole number from 1 to 7.');
  assert.equal(app.validateDraft({ ...ok, kind: 'weekly', times: 2.5 }).error, 'Days a week must be a whole number from 1 to 7.');
  assert.equal(app.validateDraft({ ...ok, kind: 'every', every: 0 }).error, 'Every how many days must be a whole number, 1 or more.');
  assert.equal(app.validateDraft({ ...ok, kind: 'every', direction: 'stop' }).error, 'Pick a schedule.');
  assert.equal(app.validateDraft({ ...ok, amount: 0 }).error, 'The amount must be a number above 0.');
  assert.equal(app.validateDraft({ ...ok, amount: NaN }).error, 'The amount must be a number above 0.');
  assert.equal(app.validateDraft({ ...ok, direction: 'stop', amount: -1 }).error, 'The limit must be 0 or more.');
  assert.equal(app.validateDraft({ ...ok, amount: 1.5 }).error, 'Times must be a whole number.');
});

test('validateDraft returns a normalized habit shape when sound', () => {
  const d = { ...app.blankDraft(), action: ' get out of bed ', cue: ' before 6 a.m. ', identity: 'a morning person', days: [5, 1, 3] };
  const v = app.validateDraft(d);
  assert.deepEqual(v, {
    direction: 'start', action: 'get out of bed', cue: 'before 6 a.m.', identity: 'a morning person',
    schedule: { kind: 'days', days: [1, 3, 5] }, goal: { amount: 1, unit: 'times' }
  });
  const stop = app.validateDraft({ ...d, direction: 'stop', kind: 'weekly', times: 5, amount: 0, unit: '' });
  assert.deepEqual(stop.schedule, { kind: 'weekly', times: 5 });
  assert.deepEqual(stop.goal, { amount: 0, unit: 'times' });
  const measured = app.validateDraft({ ...d, kind: 'every', every: 3, amount: 2.5, unit: ' miles ' });
  assert.deepEqual(measured.schedule, { kind: 'every', days: 3 });
  assert.deepEqual(measured.goal, { amount: 2.5, unit: 'miles' });
});

test('draftFrom round-trips a habit through the form', () => {
  const habit = {
    direction: 'stop', action: 'snack after dinner', cue: '', identity: 'a disciplined eater',
    schedule: { kind: 'weekly', times: 5 }, goal: { amount: 0, unit: 'times' }
  };
  const v = app.validateDraft(app.draftFrom(habit));
  assert.deepEqual({ direction: v.direction, action: v.action, cue: v.cue, identity: v.identity, schedule: v.schedule, goal: v.goal }, habit);
});

test('withAmount sets or removes one day and never mutates the old log', () => {
  const log = { '2026-10-15': 1 };
  const next = app.withAmount(log, '2026-10-16', 3);
  assert.deepEqual(next, { '2026-10-15': 1, '2026-10-16': 3 });
  assert.deepEqual(log, { '2026-10-15': 1 });
  assert.deepEqual(app.withAmount(next, '2026-10-15', 0), { '2026-10-16': 3 });
  assert.deepEqual(app.withAmount(next, '2026-10-15', NaN), { '2026-10-16': 3 });
  assert.deepEqual(app.withAmount(undefined, '2026-10-17', 1), { '2026-10-17': 1 });
  // A stop habit keeps a 0: the mark for a clean day. NaN takes the mark back.
  assert.deepEqual(app.withAmount({}, '2026-10-17', 0, true), { '2026-10-17': 0 });
  assert.deepEqual(app.withAmount({ '2026-10-17': 0 }, '2026-10-17', NaN, true), {});
  assert.deepEqual(app.withAmount({}, '2026-10-17', 0, false), {});
});

test('month grid helpers', () => {
  assert.equal(app.daysInMonth('2026-10'), 31);
  assert.equal(app.daysInMonth('2028-02'), 29);
  assert.equal(app.daysInMonth('2026-02'), 28);
  assert.equal(app.addMonths('2026-10', 1), '2026-11');
  assert.equal(app.addMonths('2026-12', 1), '2027-01');
  assert.equal(app.addMonths('2026-01', -1), '2025-12');
  const cells = app.monthCells('2026-10', 4, 31); // October 2026 starts on a Thursday
  assert.equal(cells.length, 35);
  assert.deepEqual(cells.slice(0, 5), [null, null, null, null, '2026-10-01']);
  assert.equal(cells[34], '2026-10-31');
});

test('documentProblem names the first thing wrong with a file, and normalizeDocument fills the optional fields', () => {
  const habit = () => ({ id: 'h_1', action: 'floss', cue: '', identity: 'someone who keeps their teeth', direction: 'start', created: '2026-10-01', archived: null, snoozes: [], schedule: { kind: 'days', days: [1, 2, 3, 4, 5] }, goal: { amount: 1, unit: 'times' }, log: { '2026-10-02': 1 } });
  const doc = (...habits) => ({ v: 1, updated: '2026-10-17T20:14:03Z', habits });
  assert.equal(app.documentProblem(doc(habit())), '');
  assert.equal(app.documentProblem(doc()), '');
  assert.equal(app.documentProblem(null), 'not a document');
  assert.equal(app.documentProblem([]), 'not a document');
  assert.equal(app.documentProblem({ v: 2, updated: '', habits: [] }), 'v is not 1');
  assert.equal(app.documentProblem({ v: 1, updated: '', habits: {} }), 'habits is not a list');
  assert.equal(app.documentProblem({ v: 1, updated: 'not-a-time', habits: [] }), 'updated is not a UTC instant');
  assert.equal(app.documentProblem({ v: 1, updated: '2026-10-17T20:14:03.123Z', habits: [] }), '', 'milliseconds are fine');
  assert.equal(app.documentProblem({ v: 1, updated: '2026-13-17T20:14:03Z', habits: [] }), 'updated is not a UTC instant');
  assert.equal(app.documentProblem(doc(habit(), habit())), 'habit 2: id h_1 is used twice');
  const bad = (change) => { const h = habit(); h.id = 'h_2'; change(h); return app.documentProblem(doc(habit(), h)); };
  assert.equal(bad((h) => { h.id = ''; }), 'habit 2: id is missing');
  assert.equal(bad((h) => { h.action = '  '; }), 'habit 2: action is missing');
  assert.equal(bad((h) => { h.identity = 7; }), 'habit 2: identity is missing');
  assert.equal(bad((h) => { h.direction = 'pause'; }), 'habit 2: direction is not start or stop');
  assert.equal(bad((h) => { h.created = '2026-13-01'; }), 'habit 2: created is not a date');
  assert.equal(bad((h) => { h.archived = 'soon'; }), 'habit 2: archived is not a date');
  assert.equal(bad((h) => { h.snoozes = [{ from: '2026-10-12', to: '2026-10-11' }]; }), 'habit 2: snooze 1 ends before it starts');
  assert.equal(bad((h) => { h.snoozes = [{ from: '2026-10-12', to: null }]; }), '', 'an open snooze is fine');
  assert.equal(bad((h) => { h.schedule = { kind: 'days', days: [] }; }), 'habit 2: schedule has no days');
  assert.equal(bad((h) => { h.schedule = { kind: 'days', days: [1, 7] }; }), 'habit 2: schedule days are not weekdays 0 to 6');
  assert.equal(bad((h) => { h.schedule = { kind: 'days', days: [1, 1] }; }), 'habit 2: schedule days are not weekdays 0 to 6');
  assert.equal(bad((h) => { h.schedule = { kind: 'days', days: [false, true, null] }; }), 'habit 2: schedule days are not weekdays 0 to 6');
  assert.equal(bad((h) => { h.schedule = { kind: 'days', days: ['1'] }; }), 'habit 2: schedule days are not weekdays 0 to 6');
  assert.equal(bad((h) => { h.schedule = { kind: 'weekly', times: 8 }; }), 'habit 2: times a week is not 1 to 7');
  assert.equal(bad((h) => { h.schedule = { kind: 'every', days: 2.5 }; }), 'habit 2: every N days is not a whole number');
  assert.equal(bad((h) => { h.direction = 'stop'; h.goal.amount = 0; h.schedule = { kind: 'every', days: 3 }; }), 'habit 2: a stop habit cannot be every N days');
  assert.equal(bad((h) => { h.schedule = { kind: 'monthly' }; }), 'habit 2: schedule kind is unknown');
  assert.equal(bad((h) => { h.goal.amount = 0; }), 'habit 2: goal amount is not above 0');
  assert.equal(bad((h) => { h.direction = 'stop'; h.goal.amount = 0; }), '', 'a limit of 0 is fine');
  assert.equal(bad((h) => { h.direction = 'stop'; h.goal.amount = -1; }), 'habit 2: limit is below 0');
  assert.equal(bad((h) => { h.goal.unit = ''; }), 'habit 2: goal unit is missing');
  assert.equal(bad((h) => { h.goal.amount = 1.5; }), 'habit 2: times is not a whole number');
  assert.equal(bad((h) => { h.goal = { amount: 1.5, unit: 'miles' }; }), '', 'a measured amount may be a fraction');
  assert.equal(bad((h) => { h.log = [1]; }), 'habit 2: log is missing');
  assert.equal(bad((h) => { h.log = { 'yesterday': 1 }; }), 'habit 2: log date yesterday is not a date');
  assert.equal(bad((h) => { h.log = { '2026-10-02': '1' }; }), 'habit 2: log amount on 2026-10-02 is not a number');
  // The optional fields may be missing and are filled in
  const sparse = habit(); delete sparse.cue; delete sparse.snoozes; delete sparse.archived;
  assert.equal(app.documentProblem(doc(sparse)), '');
  const norm = app.normalizeDocument(doc(sparse));
  assert.deepEqual(norm.habits[0], habit());
  assert.equal(norm.updated, '2026-10-17T20:14:03Z');
  assert.equal(app.serializeDocument(app.emptyDocument()), '{\n  "v": 1,\n  "updated": "",\n  "habits": []\n}\n');
  assert.equal(app.plural(1, 'habit'), '1 habit');
  assert.equal(app.plural(2, 'habit'), '2 habits');
  assert.equal(app.FILE_NAME, 'Low-Hanging Fruit.json');
});

test('ids and the empty document', () => {
  assert.match(app.newId(), /^h_[a-z0-9]+$/);
  assert.notEqual(app.newId(), app.newId());
  assert.deepEqual(app.emptyDocument(), { v: 1, updated: '', habits: [] });
  assert.match(app.APP_VERSION, /^\d{4}\.\d{2}\.\d{2}\.\d+$/);
});
