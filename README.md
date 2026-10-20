# Low-Hanging Fruit

A personal habit tracker for one iPhone. It keeps every habit and check-in in one JSON document on the phone, works out streaks and completion itself, and backs the document up to a file in the owner's Google Drive through a small Apps Script web app. The spec is `CLAUDE.md`; this file is for developers.

Low-Hanging Fruit follows the [HIG](https://135crewdog.github.io/hig/) as a focused app, built for an iPhone installed to the home screen, the way [Show Time](https://github.com/135crewdog/showtime) is. [Apollo](https://github.com/135crewdog/apollo) supplies the service worker, storage, tests and workflows.

## Status

Milestone 4, in progress. The app is live and in use; Export and Import are in; the Drive backup and the guide are next. The milestones are in `CLAUDE.md`.

## Layout

```
CLAUDE.md             the spec
app/                  the PWA, published to GitHub Pages at https://135crewdog.github.io/fruit/
app/guide/            the setup guide
apps-script/Code.js   the backup web app
tests/                node --test, plus a Playwright smoke test in tests/browser/
.github/workflows/    test.yml, pages.yml
```

## Tests

`node --test` runs the unit tests (it finds `tests/*.test.js` on its own; the browser test is not named that way, so it is not picked up). `tests/rules.test.js` holds the required test tables from `CLAUDE.md` verbatim; if the code disagrees with a table, the code is wrong. `tests/app.test.js` covers the app's pure helpers.

The browser smoke test needs Playwright with Chromium (a development tool, nothing is saved to the repository): `npm install --no-save --no-package-lock playwright && npx playwright install chromium`, then `node tests/browser/smoke.js [screenshot-dir]`. It serves `app/` and drives it at an iPhone viewport through adding, logging, backfilling, snoozing, editing, archiving and deleting habits, Settings, a reload and the service worker. CI runs both on every push and pull request, and the Pages deploy waits for them.

## The icon

`node tools/icon.js` renders `app/icon-512.png` and `app/icon-192.png` from the template inside it (Inter and Noto Color Emoji must be installed; CI's Ubuntu runner has both). Change the template, re-render, commit the PNGs.

## Hosting

`pages.yml` publishes `app/` to GitHub Pages at https://135crewdog.github.io/fruit/ on every push to `main` that touches it. One-time setup: Settings → Pages → Build and deployment → Source: GitHub Actions. On the iPhone, open the address in Safari, Share → Add to Home Screen.

## API

The backup script answers JSON. `GET ?token=…` returns `{ ok, version, updated, data }`. `POST` with a `text/plain` body `{ token, data }` replaces the stored document when `data.updated` is newer, answers `ok` without writing when it is equal, and refuses with `{ ok: false, error: "backup is newer", updated }` when the stored one is newer. See "Backup" in `CLAUDE.md`.

## Versions

Bump `VERSION` in `app/sw.js` and `APP_VERSION` in `app/app.js` on every change under `app/`. Bump `SCRIPT_VERSION` in `apps-script/Code.js` on every change there, then deploy a new version of the same deployment.
