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
  assert.equal(app.streakWords(days, 10), '10 days');
  assert.equal(app.streakWords(days, 1), '1 day');
  assert.equal(app.streakWords(days, 0), '0 days');
  assert.equal(app.streakWords(weekly, 3), '3 weeks');
  assert.equal(app.streakWords(weekly, 1), '1 week');
  assert.equal(app.percentWords({ done: 5, scheduled: 12 }), '42%');
  assert.equal(app.percentWords({ done: 2, scheduled: 2 }), '100%');
  assert.equal(app.percentWords(null), '');
});

test('the control follows the goal: check, count, amount, slips', () => {
  const h = (direction, amount, unit) => ({ direction, goal: { amount, unit } });
  assert.equal(app.controlKind(h('start', 1, 'times')), 'check');
  assert.equal(app.controlKind(h('start', 8, 'times')), 'count');
  assert.equal(app.controlKind(h('start', 1, 'miles')), 'amount');
  assert.equal(app.controlKind(h('start', 64, 'oz')), 'amount');
  assert.equal(app.controlKind(h('stop', 0, 'times')), 'slips');
  assert.equal(app.controlKind(h('stop', 2, 'drinks')), 'slips');
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

test('ids and the empty document', () => {
  assert.match(app.newId(), /^h_[a-z0-9]+$/);
  assert.notEqual(app.newId(), app.newId());
  assert.deepEqual(app.emptyDocument(), { v: 1, updated: '', habits: [] });
  assert.match(app.APP_VERSION, /^\d{4}\.\d{2}\.\d{2}\.\d+$/);
});
