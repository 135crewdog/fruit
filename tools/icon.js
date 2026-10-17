'use strict';
/*
 * Renders the app icon: the name in title case, the peach emoji as the hyphen, over a mango
 * gradient. Run with `node tools/icon.js` (needs Playwright with Chromium, a development tool).
 * The icon is baked to PNG here so every device shows the same picture; iOS applies its own
 * corner mask, so the PNG is a full-bleed square. Inter and Noto Color Emoji must be installed.
 */
const path = require('node:path');
const { chromium } = require('playwright');

const APP = path.join(__dirname, '..', 'app');
const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; background: transparent; }
  .tile {
    width: 512px; height: 512px; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(180deg, #6DB33F 0%, #F4B400 52%, #E8542B 100%);
    font-family: Inter, "Inter Display", -apple-system, sans-serif; font-weight: 800; font-size: 100px;
    line-height: 1; letter-spacing: -1.5px; color: #1c1c1e; text-align: center; -webkit-font-smoothing: antialiased;
  }
  .peach { font-family: "Noto Color Emoji"; letter-spacing: 0; font-size: 92px; vertical-align: -6%; }
</style></head><body><div class="tile"><div>Low&thinsp;<span class="peach">\u{1F351}</span><br>Hanging<br>Fruit</div></div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  for (const size of [512, 192]) {
    const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 });
    await page.setContent(HTML);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(APP, `icon-${size}.png`), omitBackground: true });
    await page.close();
    console.log('wrote app/icon-' + size + '.png');
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
