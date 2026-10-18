# Low-Hanging Fruit

Personal habit tracker. A PWA installed on one iPhone keeps every habit and every check-in in one JSON document on the phone, works out streaks and completion itself, and backs the document up to a file in the owner's Google Drive through a tiny Apps Script web app. It tracks habits to start and habits to stop. A replacement for the habit-tracking core of Atoms, nothing more.

Low-Hanging Fruit follows the HIG at https://135crewdog.github.io/hig/ (Simple, Future-proof, Efficient, and the Baseline). It is a **focused** app in the HIG's sense: built for an iPhone in portrait, installed to the home screen, following iOS defaults, the way Show Time is. It is not a plain page for any device like Apollo.

## The three project rules

1. **SIMPLE.** One JSON document, one app, one tiny script. Plain HTML/CSS/JS, no framework, no build step, no runtime dependencies. When in doubt, choose fewer fields, files and features.
2. **FUTURE-PROOF.** The data is a readable JSON file the owner holds: exportable from Settings, backed up to their own Drive. Every rule lives in one pure file. If the app disappeared tomorrow, the file would still read and the rules would still be in plain words here.
3. **LOCAL DAY.** A habit day is the device's local calendar day. "Today" is the local date. A 9 pm check-in is today. (This is the opposite of Apollo's Zulu rule, on purpose: a habit belongs to the day the person lived.)

Ask the user before adding anything that is not in this file. Ideas that were discussed and not adopted are listed under "Parked" at the end; do not build them without asking.

**Working rule:** propose a solution and agree it with the user before building it. A pull request waits for the user's review; never merge one unasked. Each milestone is looked at on the user's iPhone, installed to the home screen, before the next starts.

## Milestones

| # | Scope | Status |
|---|---|---|
| 1 | This file and `README.md`, agreed and merged. Nothing else. | Done, 2026-10-17 |
| 2 | `app/rules.js` and `tests/rules.test.js` from the required test tables below. | Done, 2026-10-17 |
| 3 | The app in `app/`, local only (no backup yet), published to GitHub Pages at `https://135crewdog.github.io/fruit/` and looked at on the iPhone. | In review |
| 4 | `apps-script/Code.js`, the Backup section of Settings, Export and Import, and the guide. | |

## The data

One document in `localStorage` under `fruit.data`. The backup file and the export are this document, byte for byte.

```json
{
  "v": 1,
  "updated": "2026-10-17T20:14:03Z",
  "habits": [
    {
      "id": "h_k3j9",
      "action": "get out of bed",
      "cue": "before 6 a.m.",
      "identity": "a morning person",
      "direction": "start",
      "created": "2026-01-21",
      "archived": null,
      "snoozes": [{ "from": "2026-10-12", "to": "2026-10-13" }],
      "schedule": { "kind": "days", "days": [1, 2, 3, 4, 5] },
      "goal": { "amount": 1, "unit": "times" },
      "log": { "2026-10-15": 1, "2026-10-16": 1 }
    }
  ]
}
```

- `v` is the document version, `1`. `updated` is the UTC instant of the last change, the one place UTC appears; it orders backups, nothing else.
- A habit's statement has three parts, after Atoms: `action` ("get out of bed"), `cue` ("before 6 a.m.", optional) and `identity` ("a morning person"). The app assembles the sentence: "I will get out of bed before 6 a.m. so that I can become a morning person."
- `direction` is `start` (do this) or `stop` (don't do this). A stop habit's sentence is "I will not drink more than two beers on a weeknight so that I can become a clear-headed person."
- `schedule.kind` is one of:
  - `days`: `days` lists weekdays, `0` = Sunday to `6` = Saturday. Atoms' only kind.
  - `weekly`: `times` is N done days per week, on any days.
  - `every`: `days` is N; scheduled days are `created`, `created` + N, `created` + 2N, and so on.
- `goal.amount` is a number, `goal.unit` free text, `times` by default. Units are labels; nothing converts. For a start habit the goal is what makes a day done: `amount` is above 0, and a `times` goal of 1 is the plain once-a-day habit. For a stop habit the goal is a **limit**, at most `amount` a day: `0 times` by default (none at all), or `2 drinks` for "drink less".
- `log` maps a local date (`YYYY-MM-DD`) to the amount logged that day: what was done for a start habit, the slips for a stop habit. A start habit's day is **done** when its amount is at least `goal.amount`, **partial** when it is above 0 and below. A stop habit's day is **done** when it is logged with slips at most the limit (a `0` is the mark for a day with nothing to report), **missed** when over the limit or, once the day is over, when nothing was logged. A start habit's key whose amount falls to 0 is removed; a stop habit's `0` is kept, because it is the mark.
- `id` is random and never shown. `created` is the local date the habit was made. `archived` is the local date it was archived, or `null`.
- `snoozes` lists the breaks taken from the habit, each `{ from, to }` with inclusive local dates, `to` null for a snooze until turned off. A snooze always starts on the day it is made. The list is kept forever, because the history depends on it.
- Settings live apart, in `fruit.settings` (`{ url, token, theme }`), so a backup or export never carries the token.

## The rules

All of this lives in one file, `app/rules.js`: pure functions, no DOM, no storage, unit-tested in Node. Nothing else does date or streak math.

"Today" is the device's local date. Weeks run Sunday to Saturday, as on the iPhone's own calendar in the US. Dates are `YYYY-MM-DD` strings and the math is done on year, month and day numbers.

### Scheduled days, streaks, completion

| Schedule | A scheduled day is | Current streak | Completion rate |
|---|---|---|---|
| `days` | a date whose weekday is in `days` | done scheduled days, counting back from today until two missed scheduled days in a row; today is skipped until it is settled | done scheduled days ÷ scheduled days, from `created` through yesterday, plus today once it is settled |
| `every` N | `created` + k·N for k = 0, 1, 2… | as `days` | as `days` |
| `weekly` N | every day; the week is the unit | met weeks, counting back from the current week until a week short by two or more, or two weeks short by one in a row; a week is skipped until it is settled | met weeks ÷ whole weeks, from the first Sunday on or after `created` through last week |

- **Today counts once its outcome is settled.** A start habit's day settles when it is done; a stop habit's day settles when it is marked or the limit is exceeded. Until then today is skipped by every figure: a day done or marked adds to the streak at once, a slip over the limit counts against it at once, and a day left alone is nothing until it ends, when it becomes a miss.
- **A week settles** as met once N of its settled days are done, and as short once it can no longer reach N (its days not yet missed number fewer than N). Until then the current week is skipped. Whole weeks begin at the first Sunday on or after `created`; the days before it are a partial week and count for Total only.
- **Never miss twice.** A streak survives one missed scheduled day; two missed scheduled days in a row end it. Walking back from today: skip today while unsettled, count the done days, and pass over a miss unless the scheduled day before it was also missed. The forgiven day adds nothing to the streak, still shows as missed on the calendar, and still counts against the completion rate; only the streak forgives. For a stop habit the same: one day over the limit, or left unmarked, is forgiven unless the scheduled day before it was missed too.
- **Weeks: short by one.** A week with N−1 done days is forgiven unless the week before it also fell short; a week short by two or more ends the streak, the moment it settles. Same walk back, with the week as the unit.
- **Stop habits** use the same rules. "Done" means logged within the limit: marked with nothing to report, or with slips at most the limit. A day that was never opened is a miss, so a streak cannot grow while the app sits unopened. There is no partial state: a slip within the limit is still a done day. No word names the state in the app; the row shows a ring, a check or a count. A stop habit's schedule is `days` or `weekly` (N days a week within the limit); `every` is not offered, because "every 3 days" means nothing for a habit to stop.
- **Total** is the number of done days since `created`, scheduled or not. It is a count of days, not a sum of amounts, so a 64-oz habit and a 1-time habit read alike. For a stop habit it counts scheduled days within the limit only: there is no bonus for a day on which nothing was asked.
- **Best streak** is the longest current-streak value the habit has ever had, by the same rule.
- A **bonus day** (done, not scheduled) counts toward Total and nothing else: it neither extends nor breaks a streak and is in neither side of the completion rate.
- A **partial day** (start habits only) is not done. It is shown in yellow and counts for nothing in the rules.
- A **missed day** is a scheduled day that has settled without being done: for a start habit, a past scheduled day without a done amount; for a stop habit, a scheduled day over the limit, today included, or a past scheduled day never logged.
- **No scheduled days yet** (a habit created today, a `weekly` habit in its first week): completion rate is blank, not 0%.
- An **archived** habit is frozen: no scheduled days fall after `archived`, and its figures stop there.
- A **snoozed** day asks nothing: it is not a scheduled day, so it is in no streak, in neither side of the completion rate, never missed, and plain on the calendar. A start habit done on one is a bonus day. For a `weekly` habit the snoozed days are left out of the week, and a week with fewer days left than N is off: it drops out of every figure the way a snoozed day does. Stop habits snooze the same way. A snooze starts today, never in the past, so there is no retroactive excuse; the mulligan stays parked.

### Required test cases

These are the spec. If the code disagrees with these tables, the code is wrong. Never change an expected value to make a test pass; ask the user. `tests/rules.test.js` holds these tables verbatim.

Today is **2026-10-17, a Saturday**, unless a row says otherwise. Every logged day in these tables is done (amount at goal) unless marked partial; for a stop habit the log lists the days marked with nothing to report (`marked`, an amount of 0), the slips with their amounts where they matter, and the days nothing was logged. `snoozed Oct 12–13` is a snooze over those days, `snoozed from Oct 12` one until turned off. Weekdays are Monday to Friday.

| # | Habit | Log | Current streak | Best streak | Completion | Total |
|---|---|---|---|---|---|---|
| 1 | weekdays, created 2026-10-01 | Oct 12, 13, 14, 15, 16 | 5 | 5 | 5/12 | 5 |
| 2 | weekdays, created 2026-10-01, today 2026-10-16 (Fri), Oct 16 not yet logged | Oct 12, 13, 14, 15 | 4 | 4 | 4/11 | 4 |
| 3 | weekdays, created 2026-10-01, today 2026-10-16 (Fri) | Oct 12, 13, 14, 15, 16 | 5 | 5 | 5/12 | 5 |
| 4 | weekdays, created 2026-10-01, today 2026-10-16 (Fri), Oct 16 not yet logged | Oct 12, 13, 14 | 3 | 3 | 3/11 | 3 |
| 5 | weekdays, created 2026-10-01, today 2026-10-16 (Fri) | Oct 12, 13, 14, 16 | 4 | 4 | 4/12 | 4 |
| 6 | weekdays, created 2026-10-01 | Oct 10 (Sat), 12, 13, 14, 15, 16 | 5 | 5 | 5/12 | 6 |
| 7 | weekdays, created 2026-10-01 | Oct 1, 2, 5, 6, 7, 12, 13 | 0 | 5 | 7/12 | 7 |
| 8 | weekdays, created 2026-10-17 (today) | none | 0 | 0 | blank | 0 |
| 9 | weekdays, goal 8 times, created 2026-10-12 | Oct 12: 8, 13: 8, 14: 8, 15: 8, 16: 5 (partial) | 4 | 4 | 4/5 | 4 |
| 10 | weekdays, created 2026-10-01, archived 2026-10-10 | Oct 1, 2, 5, 6, 7, 8, 9 | 7 | 7 | 7/7 | 7 |
| 11 | every 3 days, created 2026-09-28 | Oct 1, 4, 7, 10, 13, 16 | 6 | 6 | 6/7 | 6 |
| 12 | every 3 days, created 2026-09-28 | Sep 28, Oct 1, 4, 7, 10, 13, 16 | 7 | 7 | 7/7 | 7 |
| 13 | every 3 days, created 2026-09-28 | Sep 28, Oct 1, 4, 10, 13, 16 | 6 | 6 | 6/7 | 6 |
| 14 | 3 per week, created 2026-09-27 | Sep 28, 30, Oct 2, 5, 7, 9, 12, 14 | 2 | 2 | 2/2 | 8 |
| 15 | 3 per week, created 2026-09-27 | Sep 28, 30, Oct 2, 5, 7, 9, 12, 14, 16 | 3 | 3 | 2/2 | 9 |
| 16 | 3 per week, created 2026-09-27 | Sep 28, 30, Oct 2, 5, 7, 12, 14, 16 | 2 | 2 | 1/2 | 8 |
| 17 | 3 per week, created 2026-09-27 | Sep 28, 30, Oct 2, 5, 7, 12, 14 | 1 | 1 | 1/2 | 7 |
| 18 | 3 per week, created 2026-10-11 (this Sunday) | Oct 12, 14, 16 | 1 | 1 | blank | 3 |
| 19 | stop, every day, limit 0, created 2026-10-01 | marked Oct 1–4, 6–9, 11–16; slips Oct 5, 10 | 14 | 14 | 14/16 | 14 |
| 20 | stop, every day, limit 0, created 2026-10-01 | marked Oct 1–4, 6–9, 11–16; slips Oct 5, 10, 17 (today) | 14 | 14 | 14/17 | 14 |
| 21 | stop, weekdays, limit 2 drinks, created 2026-10-12 | Oct 12: 1, 13: 3, 14: 2, 15: 0, 16: 2 | 4 | 4 | 4/5 | 4 |
| 22 | stop, 5 days a week, limit 0, created 2026-09-27 | marked Sep 27, 28, 30, Oct 1, 2, 4, 5, 9, 10, 11, 13, 14, 15, 16; slips Sep 29, Oct 3, 6, 7, 8, 12 | 2 | 2 | 1/2 | 14 |
| 23 | 3 per week, created 2026-09-20 | Sep 21, 23, 25, 28, 30, Oct 5, 7, 12, 14, 16 | 1 | 1 | 1/3 | 10 |
| 24 | 3 per week, created 2026-09-27 | Sep 28, 30, Oct 2, 7, 12, 14, 16 | 1 | 1 | 1/2 | 7 |
| 25 | stop, every day, limit 0, created 2026-10-01 | marked Oct 1–14; slips Oct 15, 16 | 0 | 14 | 14/16 | 14 |
| 26 | 5 per week, created 2026-09-27 | Sep 28, 29, 30, Oct 1, 2, 5, 6, 7, 8, 9, 12 | 0 | 2 | 2/2 | 11 |
| 27 | 3 per week, created 2026-09-20 | Sep 21, 23, 25, 28, 30, Oct 5, 7, 12, 14 | 0 | 1 | 1/3 | 9 |
| 28 | stop, every day, limit 0, created 2026-10-01 | marked Oct 1–13; nothing logged Oct 14–16 | 0 | 13 | 13/16 | 13 |
| 29 | stop, every day, limit 0, created 2026-10-01 | marked Oct 1–14, 16; nothing logged Oct 15 | 15 | 15 | 15/16 | 15 |
| 30 | weekdays, created 2026-10-01, snoozed Oct 12–13 | Oct 1, 2, 5, 6, 7, 8, 9, 14, 15, 16 | 10 | 10 | 10/10 | 10 |
| 31 | weekdays, created 2026-10-01, snoozed Oct 12–16 | Oct 1, 2, 5, 6, 7, 8, 9, 14 | 7 | 7 | 7/7 | 8 |
| 32 | stop, every day, limit 0, created 2026-10-01, snoozed Oct 10–11 | marked Oct 1–9, 12–16 | 14 | 14 | 14/14 | 14 |
| 33 | 3 per week, created 2026-09-27, snoozed Oct 4–10 | Sep 28, 30, Oct 2, 12, 14, 16 | 2 | 2 | 1/1 | 6 |
| 34 | 3 per week, created 2026-09-27, snoozed Oct 8–10 | Sep 28, 30, Oct 2, 5, 12, 14, 16 | 1 | 1 | 1/2 | 7 |
| 35 | 5 per week, created 2026-09-27, snoozed Oct 8–10 | Sep 28, 29, 30, Oct 1, 2, 5, 6, 12, 13, 14, 15, 16 | 2 | 2 | 1/1 | 12 |
| 36 | weekdays, created 2026-10-01, snoozed from Oct 12 | Oct 1, 2, 5, 6, 7, 8, 9 | 7 | 7 | 7/7 | 7 |

Notes on the rows. 1: today is a Saturday, unscheduled, so it is skipped; the 12 scheduled days are Oct 1, 2, 5–9, 12–16. 4: Thursday the 15th was missed and is forgiven, because Wednesday was done; today is still open. If Friday ends undone, two misses in a row end the streak. 5: the same miss forgiven with Friday done; the walk then runs back to Friday the 9th and Thursday the 8th, both missed, which ends it. 6: the Saturday is a bonus day. 7: Thursday the 15th and Friday the 16th are both missed, so the streak is 0; the best was Oct 1–7. 9: Friday is partial, so not done, but Thursday was done, so it is forgiven; the rate still counts it as missed. 10: nothing after Oct 10 is scheduled, so a week of silence costs nothing. 11–13: the scheduled days are Sep 28, Oct 1, 4, 7, 10, 13, 16 (and 19), so the anchor arithmetic crosses the month end; 13 missed Oct 7, forgiven because Oct 4 was done. 14–17: the whole weeks are Sep 27–Oct 3 and Oct 4–10, the current week is Oct 11–17. 14: the current week has two done days and today still open, so it is unsettled and skipped. 15: three done days settle the current week as met. 16: the week of Oct 4 has two done days, one short, forgiven because the week before was met; the current week is met, so the streak is 2. 17: the same short week forgiven, the current week still open. 18: no whole week has passed, so the rate is blank while the met current week gives a streak of one. 19: every other day marked; two isolated slips, each forgiven because the day before it was within the limit; today is not yet marked, so it is unsettled and skipped. 20: a slip today settles it as missed and puts it in the rate, but yesterday was within the limit, so it is forgiven and the streak stands. 21: Tuesday went over the limit, forgiven because Monday was within it; Thursday was marked with nothing to report. 22: the week of Sep 27 has five days marked (met), the week of Oct 4 has four (one short, forgiven), and the current week's marked days Oct 11, 13, 14, 15, 16 are five, so it is met; Total counts days within the limit through yesterday. 23: the weeks of Sep 27 and Oct 4 are each one short, two in a row, which ends the run; the met current week gives 1. 24: the week of Oct 4 has one done day, two short, not forgiven. 25: two slips in a row end the streak; the best was Oct 1–14. 26: the current week has one done day and one day left, so it can no longer reach five: it has settled short by four and ends the streak now. 27: as 23 with the current week still open, so nothing counts yet. 28: three days on which the app was not opened; the 16th is forgiven, the 15th before it ends the streak, and the figures say so. 29: one day forgotten, forgiven; fifteen marked days count. 30: a long weekend; Monday and Tuesday ask nothing and the streak runs straight through them. 31: a week off; the Wednesday done inside it is a bonus day, in Total and nowhere else. 32: a stop habit's snoozed days are neither marked nor missed. 33: the week of Oct 4 is snoozed whole, so it is off and the walk back skips it, as the rate does. 34: three snoozed days leave four, enough for three, so the week still counts, and with one done day it is short by two and ends the run. 35: the same three snoozed days leave four, too few for five, so the week is off. 36: snoozed until turned off; nothing after Oct 11 is asked.

### Schedule in words

The app describes a schedule in one phrase, built by one function in `rules.js`:

| Schedule | Words |
|---|---|
| all seven days | `Every day` |
| Monday to Friday | `Weekdays` |
| Saturday and Sunday | `Weekends` |
| any other `days` | the day names in week order, `Mon, Wed, Fri` |
| `weekly` N | `3 times a week`, `Once a week` |
| `every` N | `Every 3 days`, `Every other day` for 2, `Every day` for 1 |
| goal above 1 | the amount and unit lead: `8 times a day, weekdays`, `2 miles a day, every 3 days`, `64 oz a day, 3 times a week` |
| stop habit | the schedule words alone for a limit of 0; `Up to 2 drinks a day, weekdays` for a limit above 0; `5 days a week` for `weekly` |

## The app

### An iPhone app shell, after Show Time

The app is installed to the home screen and behaves like an iOS app. `display: standalone`, portrait, the viewport `width=device-width, initial-scale=1, viewport-fit=cover` with no user zoom, `apple-mobile-web-app-status-bar-style` black-translucent, the root a fixed element filling the viewport (`inset: 0`, never a viewport unit: `100dvh` falls short of the screen in an iOS home-screen app and left a band beneath the tab bar) with `env(safe-area-inset-*)` padding, the body painted in the page background, `overflow: hidden` on the body, and each page scrolling inside itself. The header is one line and one height on both pages, so the slide between them is steady; the date on Today sits in the page, not the header. Two top-level pages sit side by side and slide (`translateX`, 0.3s) when a tab is tapped or a horizontal swipe dominates the vertical by at least 50px. Detail and edit screens push in from the right and have a back chevron; Settings presents as a sheet. With reduced motion on, slides become cuts. On anything wider than a phone the shell and its screens are capped at 430px and centered, as Show Time is; the rest is page background.

Apollo's "no app shell" rule does **not** apply here, and the reason is written down as the HIG's Baseline asks: that rule belongs to a broad app that must look right on any device. Low-Hanging Fruit is focused on one iPhone, so it sizes itself to the phone the way Show Time does. An iPad or desktop gets whatever falls out and is not a target. The shell is the first thing checked on the phone: no band of page beneath the app, the status bar and home indicator respected, the keyboard not covering the field being typed in.

### Design system

The visual language is Show Time's and Apollo's iOS-style system: the system font stack, antialiased; a header with the 34px bold title on the left and a round 40px gear button on the right; content in sections with 13px uppercase letter-spaced gray titles over rounded 10px cards with a 1px border; 17px inputs on a gray fill with 10px radius; full-width 12px-radius buttons; iOS segmented controls; an iOS tab bar at the bottom; Settings with "Done" on the left and a centered title; a Light/Dark/Auto theme setting that also sets the page's theme color; Apple's gray palette for backgrounds, borders, fills and secondary text (`#f2f2f7`, `#ffffff`, `#c6c6c8`, `#8e8e93`, `#e5e5ea`; dark `#000000`, `#1c1c1e`, `#38383a`, `#98989d`, `#48484a`); iOS red for Delete.

Where Show Time uses iOS blue and Apollo its due-date colors, Low-Hanging Fruit uses a **pear palette**, with dark text on all of it:

| Token | First value | Used for |
|---|---|---|
| `--leaf` | `#b5c96b` light green | a done day, a done row, the primary button |
| `--pear` | `#d9c95a` yellow | a partial day, the active segment, the picked weekday |
| `--spot` | `#b89a6e` pale brown | a missed scheduled day, the "spots on a ripe pear" |

These are first values, to be tuned on the iPhone in light and dark before milestone 3 closes. The **icon** is the name in title case, extra-bold, with the peach emoji as the hyphen (`Low 🍑 / Hanging / Fruit`), on a mango gradient from green through orange to red, after Apollo's gradient icon. It is baked to PNG by `tools/icon.js` so every device shows the same picture; there is no SVG icon. Everything the app says is sentence case; section titles are uppercase as a visual device; proper nouns keep their capitals. Every date a human reads is `DD-Mmm-YY` (`17-Oct-26`); the Today date adds the weekday (`Saturday 17-Oct-26`).

**Every list row leads with the identity**, on Today and Habits alike: `Become a clear-headed person` in 17px, built from the identity field the way the statement is, with what the day asks beneath it in gray, the action with its cue (`wake up before 6 a.m.`; `not drink alcohol on a weeknight` for a stop habit). The identity is the point of the habit and the action is the chore, so the action never heads a row. Two habits that share an identity read as twins at a glance and the gray line tells them apart. The detail screen shows the whole sentence.

### Navigation

An iOS tab bar at the bottom with two tabs, **Today** and **Habits**, and the gear in the header for Settings. (Atoms has four tabs; two is what this app needs.)

### Today

The title "Today" in the header, the local date with its weekday as the first line of the page. A card of today's scheduled habits, one row each: the identity in 17px with the action and cue beneath in gray, and on the right the control for its goal:

- once a day: a check, tapped to log, tapped again to undo;
- a count per day: `+` with the count beside it (`3 of 8`), `−` to undo one;
- a measured amount: a number field with the unit beside it; clearing it undoes;
- a stop habit: a stepper whose middle is an empty ring until the day is logged. A tap on the ring marks the day with nothing to report, and the middle becomes a check (limit 0) or `0 of 2` (a limit above 0); `+` logs a slip (`1`, or `1 of 2`), `−` takes one back, and `−` at zero, or a tap on the check, takes the mark back. No word names the state.

A done row turns `--leaf` and shows the current streak as `10 days` (`1 day`; `3 weeks` for a weekly habit). A stop habit's row is plain until the day is marked or logged, `--leaf` while within the limit, `--spot` once over it. A row whose streak is carrying a forgiven miss (yesterday's scheduled day missed, or last week one short) says `Don't miss twice` (`Don't slip twice` for a stop habit) in gray under the streak; it is the only nudge the app gives. A second card, collapsed by default, "Not scheduled today", holds the other active start habits with the same controls, so a bonus day can be logged; a stop habit asks nothing on an unscheduled day, so it is not listed there. A snoozed habit is unscheduled for the day and is treated the same way. Empty state: "No habits yet" and an Add button. A change is saved at once and reflected at once; the app does the math.

### Habits

Every active habit in creation order, each row the identity over one gray line, the action and cue then the schedule in words (`wake up before 6 a.m. · Weekdays`, plus `· snoozed until 25-Oct-26` while a snooze is on), the current streak on the right. An Add button. An Archived group at the bottom, collapsed, with the archived habits. Tap a row to push its detail.

### Habit (pushed)

The full statement as one sentence, the schedule in words beneath it, and `Snoozed until 25-Oct-26` or `Snoozed until turned off` while a snooze is on. Four figures in a 2×2 card: Current streak, Best streak, Completion rate (as a percent, blank when there is nothing to count), Total. Then the **calendar**: one month, this month first, a swipe for earlier months back to `created`, with each day colored by state: done `--leaf`, partial `--pear`, missed `--spot`, unscheduled or future plain. The legend names the states in the habit's own terms: for a stop habit, `no slip` and `a slip, or not marked`, or `within the limit` and `over the limit, or not marked`. A stop habit's unscheduled days stay plain whatever the log says. Tapping a past or present day logs it the same way Today does (a check toggles, a count or a stop habit opens its stepper, an amount opens a field); this is the backfill. Below: Edit, Snooze (End snooze while one is on), Archive (Unarchive on an archived habit), Delete (asks first, red). An archived habit shows its figures frozen at `archived`.

**Snooze** presents as a sheet, after Atoms: a list of one choice, Until tomorrow (today only), For a week (back on this weekday next week), For a month (back on this date next month), Until a date (a native date picker, tomorrow or later; the snooze runs through the day before), Until turned off; then Confirm and Cancel. The snooze starts today. End snooze closes it at yesterday, or removes it if it began today.

### New and Edit habit (pushed)

A segmented control first: Start a habit / Stop a habit. Then the live sentence, assembled as the fields fill, and three fields: "I will…" or "I will not…" (the action, required), "…when or where…" (the cue, optional), "…so that I can become…" (the identity, required). The placeholders follow the direction: `get out of bed`, `before 6 a.m.`, `a morning person` for a start habit; `drink more than two beers`, `on a weeknight`, `a clear-headed person` for a stop habit. A segmented control for the schedule kind, Days / Per week / Every N days (Every N days is not offered for a stop habit), and beneath it the seven-day picker, a number of times, or a number of days. Goal, or Limit for a stop habit: an amount (1 by default; 0 for a stop habit) and a unit (`times` by default; free text with a datalist of Atoms' units: times, steps, cups, ml, liters, oz, hours, min, sec, cal, kcal, miles, km, meters, feet, yards, pounds, kg). Save is disabled until the action, the identity, a valid schedule and a valid amount exist: a finite number above 0 for a goal, 0 or above for a limit. Editing changes the habit for all time; there is no schedule history (parked). No time, no reminder.

### Settings (sheet)

Sections: **Backup** (web app URL, token, Show token, Save, Back up now, Restore from backup, last backup and last error), **Export** (Export file, Import file), **Appearance** (Theme: Light, Dark, Auto), **Data** (Clear local data, asks first; the backup file is never touched), **Help** (Setup guide), and the versions (the app's, and the script's when the backup has answered).

### Storage

`localStorage` keys `fruit.data` (the document), `fruit.settings` (`{ url, token, theme }`) and `fruit.backup` (`{ lastBackup, pending, lastError }`).

### Hosting and updates

`app/` is published to GitHub Pages by `.github/workflows/pages.yml` on every push to main that touches it, at `https://135crewdog.github.io/fruit/`. `sw.js` is Apollo's: every file network-first and revalidated past the HTTP cache, the cached copy as the offline fallback, API calls never intercepted, and on activation only its own earlier caches (`fruit-*`) deleted, because cache storage is shared by every app on the `github.io` origin. Bump `VERSION` in `sw.js` and `APP_VERSION` in `app.js` on every change to `app/`, or devices keep the old copy.

## Backup

The phone is the source of truth. The backup exists so that a lost or replaced phone, or a removed home-screen app, does not lose the document.

### The script (`apps-script/Code.js`)

A standalone Apps Script, bound to nothing, deployed as a web app (Execute as: Me; Access: Anyone), with the shared secret in Script Properties under `FRUIT_TOKEN` (lowercase letters and digits, eight or more). It keeps one file, `Low-Hanging Fruit.json`, in the owner's Drive root, created empty on the first call. Every response is JSON; Apps Script cannot set status codes, so errors are `{ "ok": false, "error": "..." }`.

- `GET ?token=…` returns `{ ok, version, updated, data }`: the script's `SCRIPT_VERSION`, the stored document's `updated`, and the document (or `null` when the file is empty).
- `POST` with body `{ token, data }` (Content-Type `text/plain`, because Apps Script does not answer CORS preflights) replaces the file when `data.updated` is later than the stored `updated`, and returns `{ ok, version, updated }`. When the two are equal it changes nothing and still returns `ok`: a backup whose reply was lost is simply sent again. Only when the stored document is newer does it refuse, with `{ ok: false, error: "backup is newer", updated }`. The body is parsed and `data.v`, `data.updated` and `data.habits` checked before anything is written. Under the script lock.

After a code change, bump `SCRIPT_VERSION`, paste again and deploy a **new version** of the same deployment, or the web app keeps serving old code.

### In the app

- Every change to the document sets `updated` and marks the backup pending. A backup runs a few seconds after the last change when online, and on load, on `online`, when the app becomes visible, and from Back up now, while one is pending. A failure keeps it pending and shows the error in Settings.
- "Backup is newer" is shown in Settings with a Restore button; nothing is overwritten either way without the user choosing.
- Restore from backup replaces the local document with the stored one, after asking. On first run with a URL and token saved and no habits, the app offers Restore itself.
- Export writes the document to `Low-Hanging Fruit.json` through the share sheet. Import reads one, checks it is a document as described under The data (`v` is 1, every habit has its fields with valid values, every log key a date and every amount a number, every snooze a pair of dates in order or an open end) and names the first problem if not, then replaces the local document after asking. Both work with no backend at all.
- The URL and token are typed into Settings once. Never commit either.

## Architecture

```
CLAUDE.md                 this file, the spec
README.md                 for developers: tests, API, hosting, version bumps
app/                      the PWA: index.html, app.js, rules.js, style.css, sw.js, manifest.webmanifest, icon-192.png, icon-512.png
app/guide/                the setup guide page
apps-script/Code.js       the backup web app: doGet, doPost
tests/*.test.js           node --test: rules.test.js (the tables above), app.test.js (the app's pure helpers)
tests/browser/            smoke.js drives the app in Chromium at an iPhone viewport; needs Playwright, dev only
tools/icon.js             renders the icon PNGs; needs Playwright, dev only
.github/workflows/        test.yml runs node --test and the browser smoke test; pages.yml runs it, then publishes app/ to GitHub Pages from main
```

Reuse, not reinvention: the shell, the sliding pages and the swipe come from Show Time (ported from React to plain JS); the service worker, storage helpers, theme handling, Settings pattern, tests and workflows come from Apollo.

## Gotchas

- **Today is the local date:** `new Date()` read with `getFullYear()`, `getMonth()`, `getDate()` and formatted `YYYY-MM-DD`. Never `toISOString()` for a day: that is UTC and is wrong every evening.
- **Date math on numbers.** Add days by building a `Date` from year, month and day at noon local time and reading it back, or by day-count arithmetic; never by adding milliseconds across a DST change.
- **`updated` is UTC** (`toISOString()`), the one place UTC is right: it orders backups and is never shown.
- **The weekly streak depends on the week boundary.** Sunday start. Changing it is a parked setting, not a code tweak.
- **Forgiveness is stateless.** Never miss twice is read off the log each time; nothing records that a miss was forgiven, so there is nothing to earn, store or restore.
- **Measured amounts are numbers.** Read the field's `valueAsNumber`; `NaN` or 0 removes the day.
- **POST with `Content-Type: text/plain`** to the script, as in Apollo.
- **Bump both version strings** with every change under `app/`, and `SCRIPT_VERSION` with every change to `Code.js`.
- **The shell is iOS-sized on purpose.** A fixed root filling the viewport, safe-area insets and `overflow: hidden` are expected here. Never size it with `100vh` or `100dvh`: in an iOS home-screen app `dvh` comes out short and leaves a band under the tab bar. See "An iPhone app shell".

## Deliberately not in the app

- Reminders and notifications of any kind in version 1 (see Parked for the plan).
- Multiple habit times.
- Reflections, milestones, an accountability partner, Hall of Fame, Mindset and Focus content.
- Unit conversion.
- A profile, an account, or anyone but the owner.

## Parked

Discussed, not adopted, might come back. Ask before building.

- **Reminders.** First a per-habit iOS Shortcuts time-of-day automation that shows a notification and opens the app, documented in the guide. Later, a Shortcut that asks the backend what is still open today and only then notifies, which needs the "due today" rule in the script as well.
- **Schedule history** (Atoms' "Current schedule since…"): a changed schedule applying only from its change date, so old streaks and rates stay as they were.
- **Bonus days extending a streak.**
- **Earned or stored mulligans** (Duolingo's streak freeze), and a retroactive snooze. Never miss twice is the rule; an inventory of forgiveness is not, and a snooze starts today.
- **A Monday-start week** setting.
- **A handoff link** (`#url=…&token=…`) like Apollo's; there is no sheet menu to generate it, so the URL and token are typed once instead.
- **Other palettes.** Peach, blackberry and so on as a Settings choice; pear is the only one in version 1. The tokens are named by role (`--leaf`, `--pear`, `--spot`) so a palette is three values.
- Widgets and Apple Watch.
