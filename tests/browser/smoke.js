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
    assert.equal(await text('#subtitle'), app.longDate(TODAY, rules.weekday(TODAY)));
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
    await page.waitForSelector('#today .row .action');
    assert.equal(await text('#today .row .action'), 'floss');
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
    assert.equal(await text('#goal-title'), 'Limit');
    await page.fill('#action', 'snack after dinner');
    await page.fill('#identity', 'a disciplined eater');
    assert.equal(await text('#sentence'), 'I will not snack after dinner so that I can become a disciplined eater.');
    await shot('05-new-stop-habit');
    await page.click('#save-habit');
    await page.waitForSelector('#screen-edit:not(.open)');
    const snack = page.locator('#today .row', { hasText: 'snack after dinner' });
    await snack.waitFor();
    assert.equal(await snack.evaluate((n) => n.classList.contains('clean')), true, 'a stop row starts clean');
    assert.equal((await snack.locator('.stepper .n').textContent()).trim(), 'Clean');
    await snack.locator('.stepper button[aria-label="Slipped"]').click();
    await page.waitForSelector('#today .row.over');
    assert.equal((await snack.locator('.stepper .n').textContent()).trim(), '1 slip');
    await shot('06-today-three');
    await snack.locator('.stepper button[aria-label="Undo a slip"]').click();
    await page.waitForSelector('#today .row.over', { state: 'detached' });

    // Habits page
    await page.click('[data-tab="1"]');
    assert.equal(await text('#title'), 'Habits');
    assert.equal(await page.locator('#habits .row').count(), 3);
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
    assert.equal(await page.locator('#habits .card.list .row').count(), 2);
    await page.locator('#habits .group-head').click();
    await page.locator('#habits .row .text', { hasText: 'floss' }).click();
    await page.waitForSelector('#screen-habit.open');
    await page.locator('#habit-detail .btn', { hasText: 'Unarchive' }).click();
    await page.waitForFunction(() => !/archived/.test(document.querySelector('#habit-detail .words').textContent));

    // Delete
    await page.locator('#habit-detail .btn', { hasText: 'Delete' }).click();
    await page.waitForSelector('#screen-habit:not(.open)');
    assert.equal(await page.locator('#habits .row').count(), 2);

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
    assert.equal(await page.locator('#today .row').count(), 2, 'habits survive a reload');
    assert.equal(await page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active)), true, 'service worker active');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fruit.data')));
    assert.equal(stored.v, 1);
    assert.equal(stored.habits.length, 2);
    assert.match(stored.updated, /^\d{4}-\d{2}-\d{2}T/);

    // Swipe between pages
    await page.touchscreen.tap(300, 400);
    await page.evaluate(() => {
      const area = document.getElementById('pages-wrap');
      const t = (type, x) => area.dispatchEvent(new TouchEvent(type, { bubbles: true, targetTouches: [new Touch({ identifier: 1, target: area, clientX: x, clientY: 400 })] }));
      t('touchstart', 300); t('touchmove', 100); area.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
    });
    await page.waitForFunction(() => document.getElementById('title').textContent === 'Habits');

    // Clear local data
    await page.click('#settings-btn');
    await page.click('#clear-data');
    await page.click('#done');
    await page.click('[data-tab="0"]');
    assert.match(await text('#today'), /No habits yet/);
    assert.equal(await page.evaluate(() => localStorage.getItem('fruit.data')), null);

    assert.deepEqual(errors, [], 'no page errors');
    console.log('smoke test passed');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
