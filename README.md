# Low-Hanging Fruit

A personal habit tracker for one iPhone. It keeps every habit and check-in in one JSON document on the phone, works out streaks and completion itself, and backs the document up to a file in the owner's Google Drive through a small Apps Script web app. The spec is `CLAUDE.md`; this file is for developers.

Low-Hanging Fruit follows the [HIG](https://135crewdog.github.io/hig/) as a focused app, built for an iPhone installed to the home screen, the way [Show Time](https://github.com/135crewdog/showtime) is. [Apollo](https://github.com/135crewdog/apollo) supplies the service worker, storage, tests and workflows.

## Status

Milestone 1: the spec. There is no code yet. The milestones are in `CLAUDE.md`.

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

`node --test` runs the unit tests (it finds `tests/*.test.js` on its own; the browser test is not named that way, so it is not picked up). `tests/rules.test.js` holds the required test tables from `CLAUDE.md` verbatim; if the code disagrees with a table, the code is wrong. The browser smoke test needs Playwright and runs the app in Chromium at an iPhone viewport.

## API

The backup script answers JSON. `GET ?token=…` returns `{ ok, version, updated, data }`. `POST` with a `text/plain` body `{ token, data }` replaces the stored document when `data.updated` is newer, answers `ok` without writing when it is equal, and refuses with `{ ok: false, error: "backup is newer", updated }` when the stored one is newer. See "Backup" in `CLAUDE.md`.

## Versions

Bump `VERSION` in `app/sw.js` and `APP_VERSION` in `app/app.js` on every change under `app/`. Bump `SCRIPT_VERSION` in `apps-script/Code.js` on every change there, then deploy a new version of the same deployment.
