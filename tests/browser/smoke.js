'use strict';
/*
 * Browser smoke test. Needs Playwright with Chromium installed (a developer tool, not an
 * app dependency): `node tests/browser/smoke.js [screenshot-dir]`.
 * Serves app/ and drives it at an iPhone viewport: the empty state, a once-a-day habit, a
 * counted habit, a stop habit, the Habits page, the habit screen with its calendar and
 * backfill, Edit, Archive, Delete, Settings, persistence across a reload, the service
 * worker, and Clear local data. Pass a directory to save a screenshot of each screen there.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const rules = require('../../app/rules.js');
const app = require('../../app/app.js');

const APP_DIR = path.join(__dirname, '..', '..', 'app');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serveApp() {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(APP_DIR, p);
    if (!file.startsWith(APP_DIR) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}
function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

async function main() {
  const { chromium } = require('playwright');
  const server = serveApp();
  const port = await listen(server);
  const url = `http://127.0.0.1:${port}/`;
  // The browser and this process share a clock and a zone, so "today" agrees.
  const TODAY = rules.localToday();

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  const shots = process.argv[2];
  // A screen takes 0.3s to slide in; a capture waits for it so the guide's pictures are whole.
  const shot = async (name) => { if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: path.join(shots, name + '.png') }); } };
  const text = async (sel) => (await page.textContent(sel)).trim();

  try {
    await page.goto(url);
    assert.equal(await text('#title'), 'Today');
    assert.equal(await text('#today .date'), app.longDate(TODAY, rules.weekday(TODAY)));
    assert.match(await text('#today'), /No habits yet/);
    await shot('01-empty');

    // A once-a-day habit
    await page.click('#today .btn.primary');
    await page.waitForSelector('#screen-edit.open');
    assert.equal(await page.isDisabled('#save-habit'), true, 'Save waits for the statement');
    await page.fill('#action', 'floss');
    await page.fill('#identity', 'someone who keeps their teeth');
    assert.equal(await text('#sentence'), 'I will floss so that I can become someone who keeps their teeth.');
    assert.equal(await text('#sched-words'), 'Every day');
    await shot('02-new-habit');
    await page.click('#save-habit');
    await page.waitForSelector('#screen-edit:not(.open)');
    await page.waitForSelector('#today .row .lead');
    assert.equal(await text('#today .row .lead'), 'Become someone who keeps their teeth');
    assert.equal(await text('#today .row .sub'), 'floss');
    assert.equal(await page.getAttribute('#today .row .check', 'aria-pressed'), 'false');
    await page.click('#today .row .check');
    await page.waitForSelector('#today .row.done');
    assert.equal(await text('#today .row.done .meta'), '1 day');
    await shot('03-today-done');
    await page.click('#today .row .check');
    await page.waitForSelector('#today .row:not(.done)');

    // A counted habit, partial after three taps
    await page.click('[data-tab="1"]');
    await page.click('#add-habit');
    await page.waitForSelector('#screen-edit.open');
    await page.fill('#action', 'drink a glass of water');
    await page.fill('#identity', 'hydrated');
    await page.fill('#amount', '8');
    assert.equal(await text('#sched-words'), '8 times a day, every day');
    await page.click('#save-habit');
    await page.waitForSelector('#screen-edit:not(.open)');
    // Saving a new habit returns to Today
    await page.waitForFunction(() => document.getElementById('title').textContent === 'Today');
    const water = page.locator('#today .row', { hasText: 'drink a glass of water' });
    assert.equal((await water.locator('.stepper .n').textContent()).trim(), '0 of 8');
    for (let i = 0; i < 3; i++) await water.locator('.stepper button[aria-label="One more"]').click();
    await page.waitForFunction(() => /3 of 8/.test(document.getElementById('today').textContent));
    assert.equal(await water.locator('.stepper.partial').count(), 1, 'a partial day colors the stepper');
    await water.locator('.text').click();
    await page.waitForSelector('#screen-habit.open');
    assert.equal(await page.locator('#habit-detail .cal .day.today.partial').count(), 1, 'a partial today shows as partial on the calendar');
    await page.click('[data-close="screen-habit"]');
    await page.waitForSelector('#screen-habit:not(.open)');

    // A measured habit stores what is typed before the field is left
    await page.click('[data-tab="1"]');
    await page.click('#add-habit');
    await page.waitForSelector('#screen-edit.open');
    await page.fill('#action', 'run');
    await page.fill('#identity', 'a runner');
    await page.fill('#amount', '2');
    await page.fill('#unit', 'miles');
    assert.equal(await text('#sched-words'), '2 miles a day, every day');
    await page.click('#save-habit');
    await page.waitForSelector('#screen-edit:not(.open)');
    const run = page.locator('#today .row', { hasText: 'run' });
    await run.locator('.amount input').pressSequentially('1.5');
    const typed = await page.evaluate(() => JSON.parse(localStorage.getItem('fruit.data')).habits.find((h) => h.action === 'run').log);
    assert.equal(Object.values(typed)[0], 1.5, 'the amount is stored while the keyboard is still up');
    await run.locator('.amount input').fill('2');
    await run.locator('.amount input').blur();
    await page.waitForSelector('#today .row.done', { state: 'attached' });
    assert.equal(await run.evaluate((n) => n.classList.contains('done')), true, 'reaching the goal marks the row done');

    // A stop habit: clean until a slip
    await page.click('#settings-btn');
    await page.waitForSelector('#screen-settings.open');
    await shot('04-settings');
    await page.click('#done');
    await page.click('[data-tab="1"]');
    await page.click('#add-habit');
    await page.waitForSelector('#screen-edit.open');
    await page.click('[data-direction="stop"]');
    assert.equal(await page.isHidden('#kind-every'), true, 'every N days is not offered for a stop habit');
    assert.equal(await page.getAttribute('#action', 'placeholder'), 'drink more than two beers', 'placeholders follow the direction');
    assert.equal(await text('#goal-title'), 'Limit');
    await page.fill('#action', 'snack after dinner');
    await page.fill('#identity', 'a disciplined eater');
    assert.equal(await text('#sentence'), 'I will not snack after dinner so that I can become a disciplined eater.');
    await shot('05-new-stop-habit');
    await page.click('#save-habit');
    await page.waitForSelector('#screen-edit:not(.open)');
    const snack = page.locator('#today .row', { hasText: 'snack after dinner' });
    await snack.waitFor();
    assert.equal(await snack.evaluate((n) => n.classList.contains('clean')), false, 'a stop row is plain until the day is marked');
    assert.equal(await snack.locator('.stepper .mark .ring').count(), 1, 'the middle is an empty ring before the day is logged');
    assert.equal(await snack.locator('.stepper button[aria-label="Take back the mark"]').isDisabled(), true);
    await snack.locator('.stepper button[aria-label="Mark the day: nothing to report"]').click();
    await page.waitForSelector('#today .row.clean');
    assert.equal((await snack.locator('.stepper .n').textContent()).trim(), '✓');
    assert.match((await snack.locator('.meta').textContent()).trim(), /^1 day\b/, 'marking today clean settles it, so it counts at once');
    await snack.locator('.stepper button[aria-label="Slipped"]').click();
    await page.waitForSelector('#today .row.over');
    assert.equal((await snack.locator('.stepper .n').textContent()).trim(), '1');
    await shot('06-today-three');
    await snack.locator('.stepper button[aria-label="Undo a slip"]').click();
    await page.waitForSelector('#today .row.clean');
    await snack.locator('.stepper button.mark.on').click(); // a tap on the check takes the mark back
    await page.waitForSelector('#today .row.clean', { state: 'detached' });
    assert.equal(await snack.locator('.stepper .mark .ring').count(), 1);
    const snackLog = await page.evaluate(() => JSON.parse(localStorage.getItem('fruit.data')).habits.find((h) => h.action === 'snack after dinner').log);
    assert.deepEqual(snackLog, {}, 'taking the mark back removes the entry');
    // On its calendar, a day the stop habit is not scheduled for cannot be tapped
    await snack.locator('.text').click();
    await page.waitForSelector('#screen-habit.open');
    assert.equal(await page.locator('#habit-detail .cal .day.today').isDisabled(), false);
    await page.click('[data-close="screen-habit"]');
    await page.waitForSelector('#screen-habit:not(.open)');

    // Habits page
    await page.click('[data-tab="1"]');
    assert.equal(await text('#title'), 'Habits');
    assert.equal(await page.locator('#habits .row').count(), 4);
    assert.match(await text('#habits'), /Every day/);
    await shot('07-habits');

    // Habit screen: statement, figures, calendar with today ringed, backfill by tapping today
    await page.locator('#habits .row .text', { hasText: 'floss' }).click();
    await page.waitForSelector('#screen-habit.open');
    assert.equal(await text('#habit-detail .statement'), 'I will floss so that I can become someone who keeps their teeth.');
    assert.equal(await page.locator('#habit-detail .figure').count(), 4);
    assert.equal(await page.locator('#habit-detail .cal .day.today').count(), 1);
    assert.equal(await page.locator('#habit-detail .cal .day.off').count() > 0, true, 'days before creation are off');
    await shot('08-habit');
    await page.locator('#habit-detail .cal .day.today').click();
    await page.waitForSelector('#habit-detail .cal .day.today.done');
    assert.equal(await text('#habit-detail .figure:first-child .num'), '1');
    await shot('09-habit-done');

    // Edit: add a cue
    await page.locator('#habit-detail .btn', { hasText: 'Edit' }).click();
    await page.waitForSelector('#screen-edit.open');
    assert.equal(await text('#edit-title'), 'Edit habit');
    assert.equal(await page.inputValue('#action'), 'floss');
    await page.fill('#cue', 'after brushing');
    await page.click('#save-habit');
    await page.waitForSelector('#screen-edit:not(.open)');
    await page.waitForFunction(() => /after brushing/.test(document.querySelector('#habit-detail .statement').textContent));

    // Archive and unarchive
    await page.locator('#habit-detail .btn', { hasText: 'Archive' }).click();
    await page.waitForFunction(() => /archived/.test(document.querySelector('#habit-detail .words').textContent));
    assert.equal(await page.isDisabled('#habit-detail .cal .day.today'), true, 'an archived habit is read-only');
    await page.click('[data-close="screen-habit"]');
    await page.waitForSelector('#screen-habit:not(.open)');
    assert.match(await text('#habits'), /Archived · 1/);
    assert.equal(await page.locator('#habits .card.list .row').count(), 3);
    await page.locator('#habits .group-head').click();
    await page.locator('#habits .row .text', { hasText: 'floss' }).click();
    await page.waitForSelector('#screen-habit.open');
    await page.locator('#habit-detail .btn', { hasText: 'Unarchive' }).click();
    await page.waitForFunction(() => !/archived/.test(document.querySelector('#habit-detail .words').textContent));

    // Delete
    await page.locator('#habit-detail .btn', { hasText: 'Delete' }).click();
    await page.waitForSelector('#screen-habit:not(.open)');
    assert.equal(await page.locator('#habits .row').count(), 3);

    // Settings: theme
    await page.click('#settings-btn');
    await page.waitForSelector('#screen-settings.open');
    await page.selectOption('#theme', 'dark');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
    await shot('10-dark');
    await page.selectOption('#theme', 'auto');
    assert.match(await text('.version'), new RegExp('v' + app.APP_VERSION.replace(/\./g, '\\.')));
    await page.click('#done');

    // Persistence and the service worker
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForSelector('#today .row');
    assert.equal(await page.locator('#today .row').count(), 3, 'habits survive a reload');
    assert.equal(await page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active)), true, 'service worker active');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fruit.data')));
    assert.equal(stored.v, 1);
    assert.equal(stored.habits.length, 3);
    assert.match(stored.updated, /^\d{4}-\d{2}-\d{2}T/);

    // Swipe between pages
    await page.touchscreen.tap(300, 400);
    await page.evaluate(() => {
      const area = document.getElementById('pages-wrap');
      const t = (type, x) => area.dispatchEvent(new TouchEvent(type, { bubbles: true, targetTouches: [new Touch({ identifier: 1, target: area, clientX: x, clientY: 400 })] }));
      t('touchstart', 300); t('touchmove', 100); area.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
    });
    await page.waitForFunction(() => document.getElementById('title').textContent === 'Habits');

    // A weekday stop habit created last month: on its calendar, unmarked past weekdays are missed,
    // unmarked past weekends stay plain, and the legend names both kinds of miss.
    const lastMonth = app.addMonths(TODAY.slice(0, 7), -1);
    await page.evaluate((created) => {
      const d = JSON.parse(localStorage.getItem('fruit.data'));
      const h = d.habits.find((x) => x.action === 'snack after dinner');
      h.created = created; h.schedule = { kind: 'days', days: [1, 2, 3, 4, 5] }; h.log = {};
      localStorage.setItem('fruit.data', JSON.stringify(d));
    }, lastMonth + '-01');
    await page.reload();
    await page.waitForSelector('#today .row');
    await page.click('[data-tab="1"]');
    await page.locator('#habits .row .text', { hasText: 'snack after dinner' }).click();
    await page.waitForSelector('#screen-habit.open');
    await page.click('#habit-detail .cal-head button[aria-label="Earlier month"]');
    await page.waitForFunction((m) => document.querySelector('#habit-detail .cal-head .month').textContent === m, app.monthWords(lastMonth));
    const cells = await page.$$eval('#habit-detail .cal .day:not(.blank)', (els) => els.map((e) => ({ label: e.getAttribute('aria-label'), missed: e.classList.contains('missed'), disabled: e.disabled })));
    for (let d = lastMonth + '-01'; d <= lastMonth + '-' + String(app.daysInMonth(lastMonth)).padStart(2, '0'); d = rules.addDays(d, 1)) {
      const cell = cells.find((c) => c.label === app.formatDisplayDate(d));
      const weekend = rules.weekday(d) === 0 || rules.weekday(d) === 6;
      assert.equal(cell.missed, !weekend, d + (weekend ? ' is a weekend and stays plain' : ' is an unmarked weekday and shows missed'));
      assert.equal(cell.disabled, weekend, d + ' tappable only when scheduled');
    }
    assert.match(await text('#habit-detail .legend'), /a slip, or not marked/);
    await page.click('[data-close="screen-habit"]');
    await page.waitForSelector('#screen-habit:not(.open)');

    // The calendar turns months with a swipe, back to the month the habit was created
    const twoMonthsAgo = app.addMonths(TODAY.slice(0, 7), -2) + '-15';
    await page.evaluate((created) => {
      const d = JSON.parse(localStorage.getItem('fruit.data'));
      d.habits[0].created = created;
      localStorage.setItem('fruit.data', JSON.stringify(d));
    }, twoMonthsAgo);
    await page.reload();
    await page.waitForSelector('#today .row');
    await page.click('[data-tab="1"]');
    await page.locator('#habits .row .text').first().click();
    await page.waitForSelector('#screen-habit.open');
    const monthIs = (ym) => page.waitForFunction((m) => document.querySelector('#habit-detail .cal-head .month').textContent === m, app.monthWords(ym));
    await monthIs(TODAY.slice(0, 7));
    const swipeCal = (from, to) => page.evaluate(([x0, x1]) => {
      const grid = document.querySelector('#habit-detail .cal');
      const t = (type, x) => grid.dispatchEvent(new TouchEvent(type, { bubbles: true, targetTouches: [new Touch({ identifier: 1, target: grid, clientX: x, clientY: 500 })] }));
      t('touchstart', x0); t('touchmove', x1); grid.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
    }, [from, to]);
    await swipeCal(100, 300); // to the right: an earlier month
    await monthIs(app.addMonths(TODAY.slice(0, 7), -1));
    await swipeCal(100, 300);
    await monthIs(app.addMonths(TODAY.slice(0, 7), -2));
    await swipeCal(100, 300); // nothing before the month of creation
    await page.waitForTimeout(100);
    assert.equal(await text('#habit-detail .cal-head .month'), app.monthWords(app.addMonths(TODAY.slice(0, 7), -2)));
    assert.equal(await page.isDisabled('#habit-detail .cal-head button[aria-label="Earlier month"]'), true);
    await swipeCal(300, 100); // to the left: later
    await monthIs(app.addMonths(TODAY.slice(0, 7), -1));
    await page.click('[data-close="screen-habit"]');
    await page.waitForSelector('#screen-habit:not(.open)');

    // Clear local data
    await page.click('#settings-btn');
    await page.click('#clear-data');
    await page.click('#done');
    await page.click('[data-tab="0"]');
    assert.match(await text('#today'), /No habits yet/);
    assert.equal(await page.evaluate(() => localStorage.getItem('fruit.data')), null);

    // On a wide screen the shell is a phone's width, centered
    const wide = await context.newPage();
    await wide.setViewportSize({ width: 1024, height: 768 });
    await wide.goto(url);
    const box = await wide.evaluate(() => { const r = document.getElementById('app').getBoundingClientRect(); return { w: r.width, l: r.left }; });
    assert.equal(box.w, 430, 'the shell is capped at a phone width');
    assert.equal(box.l, (1024 - 430) / 2, 'and centered');
    await wide.close();

    assert.deepEqual(errors, [], 'no page errors');
    console.log('smoke test passed');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
