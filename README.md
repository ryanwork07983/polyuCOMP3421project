# The Workout

A private, ad-free workout planner and tracker. COMP3421 Final Project (solo).

There's no account, no server and no ads. All your data stays in your own browser (IndexedDB, with localStorage as a fallback).

## Quick facts

| Item | Details |
|---|---|
| Prerequisites | A current web browser. Optional: Python 3 (to run a local web server), Node.js (only for the developer checks) |
| Install | Nothing to install: no build step and no dependencies |
| Environment variables | None |
| Database setup | None needed. The browser creates the IndexedDB database `the-workout` automatically on the first visit. Its structure is in [Data model](#data-model) |
| Seed data | Loaded automatically on the first visit: 18 starter exercises and 3 plans (Push day, Pull day, Leg day), from `js/seed.js`. **Settings → Load demo history** adds 8 weeks of example workouts |
| Test accounts | None needed: the app has no login |
| Developer checks | `node tools/check-i18n.js` and `node tools/check-backup.js` |

## How to open the app

### Option 1: double-click (simplest)

1. Open the `the-workout` folder.
2. Double-click **`index.html`**. It opens in your default browser.

That's all. No install, no build step and no internet connection are needed. It is made for current versions of Chrome, Edge, Firefox and Safari, and was tested in Chrome.

> Your data is saved per browser. If you open the file in Chrome and later in Edge, each one has its own separate data. Use **Settings → Export JSON** and **Import JSON** to move data between them.

### Option 2: a local web server (turns on offline / install support)

Opening the file directly works for everything except the service worker (offline caching and "Install app"), because browsers only allow that over `http://`. To try it:

```bash
# from inside the the-workout folder
python -m http.server 8000
```

Then go to <http://localhost:8000>. In VS Code, the **Live Server** extension does the same job.

### Option 3: GitHub Pages (for the +5 deployment bonus)

1. Create a **public** GitHub repository and push the contents of this folder, with `index.html` at the top level.
2. In the repository's **Settings → Actions → General**, allow actions.
3. In **Settings → Pages**, set *Source* to **GitHub Actions**. The included workflow (`.github/workflows/static.yml`) then publishes the site on every push to `main`.
4. After a minute or two the app is live at `https://<your-username>.github.io/<repo-name>/`.

## What's inside

| View | Route | What it does |
|---|---|---|
| Dashboard | `#/` | Greeting, this week's training days, quick start with the plans you pin, personal bests (heaviest weight) for the exercises you pick, recent workouts, a backup reminder |
| Exercise library | `#/exercises` | **CRUD**: add, search, edit and delete exercises. Every exercise is logged as weight × reps (0 kg when done without extra weight); the muscle group can be picked or typed freely |
| Workout plans | `#/plans`, `#/plans/new`, `#/plans/<id>` | **CRUD**: create, edit, reorder, duplicate and delete plans, with target sets and reps (scroll pickers: sets 1–20, reps 1–30, default 5 × 12) and an RM guide: 1–5 reps for strength, 6–12 for muscle growth, 13–30 for endurance |
| Log session | `#/log` | **CRUD**: start from a plan or start empty, log each set with kg and reps scroll pickers that start at last time's values (±2.5 kg buttons change only their own set; a weight picked in the picker carries down to later unticked sets; only ticked sets are saved), rest timer, finish with a summary and personal bests. Also used to edit a saved session |
| History and progress | `#/history`, `#/history/progress` | Session list grouped by month (view, edit, delete), this week's sets per muscle group, weekly chart, per-exercise progress chart, personal bests |
| Settings | `#/settings` | Language, theme, kg/lb, rest timer, **JSON export/import**, storage status, **data-loss warning**, sample data, erase all |

Other features:

- **Persistence:** everything survives a refresh and a closed tab. A workout in progress is saved after every keystroke.
- **Validation:** required fields, unique names, number ranges (sets 1–20, reps 1–30 in plans; weight 0–1000 kg, reps 0–1000 in a session; duration 1–1440 minutes), future dates rejected, plus clear messages next to the field.
- **Rest timer:** length set in Settings with minute and second pickers (0:00–20:00, 0 turns it off); starts automatically when you tick a set, with ±15 s buttons and a beep or vibration at the end.
- **Undo** after deleting an exercise, plan or session.
- **Responsive:** a sidebar on desktop and a bottom tab bar on phones.
- **Accessible:** keyboard navigation, focus moves to the page title on each page change, labelled controls, and it respects reduced motion.
- **Dark mode:** follows the system setting, or you can pick light or dark.
- **Languages:** English and 繁體中文 (Traditional Chinese). The first visit follows the browser language; **Settings → Language** switches it. Dates and numbers follow the language too. Starter exercises and plans are created in the language active on the first visit; after that they are your own data and are not renamed when you switch.
- **Sample data:** 18 starter exercises and 3 plans load on the first visit. **Settings → Load demo history** adds 8 weeks of example workouts so the charts have something to show in a demo.

## Data model

Stored in IndexedDB database `the-workout` (object stores below). If IndexedDB is unavailable, the same arrays are kept in localStorage under `the-workout:store:<name>`.

- **exercises** `{ id, name, muscle_group, notes, created_at, updated_at }`. There are no bodyweight or cardio types in this version. `muscle_group` is free text (standard groups are stored in English and translated on screen).
- **plans** `{ id, name, description, items: [{ exercise_id, target_sets, target_reps }], created_at, updated_at }`
- **sessions** `{ id, date, plan_id, plan_name, notes, duration, created_at, updated_at }`
- **sets** (SetEntry) `{ id, session_id, exercise_id, exercise_name, order, set_no, reps, weight (kg) }`. Importing an older backup drops its minutes-only (cardio) sets, because they have no reps.

Settings (`the-workout:settings`) and the workout in progress (`the-workout:draft`) live in localStorage.

Sets keep a copy of the exercise name, so history still reads correctly after an exercise is deleted. Weights are always stored in kg and converted when lb is selected.

## Project structure

```
the-workout/
├── index.html            app shell and navigation
├── manifest.webmanifest  install info (PWA)
├── sw.js                 service worker for offline use (http/https only)
├── icons/icon.svg
├── css/styles.css        all styles, light and dark themes
├── tools/check-i18n.js   developer check: every text has a Chinese translation (not loaded by the app)
├── tools/check-backup.js developer check: the backup import rules (not loaded by the app)
├── .github/workflows/static.yml  GitHub Pages deployment (GitHub's standard workflow)
└── js/
    ├── i18n.js           languages: WO.t() and the 繁體中文 dictionary
    ├── utils.js          helpers: escaping, settings, dates, units, icons, modal/toast
    ├── db.js             storage layer: IndexedDB → localStorage → memory fallback
    ├── stats.js          volume, personal bests, streaks, weekly counts
    ├── seed.js           starter exercises/plans and demo history
    ├── charts.js         hand-written SVG line and bar charts
    ├── timer.js          rest timer
    ├── app.js            start-up and hash router
    └── views/            dashboard, exercises, plans, log, history, settings
```

It uses plain HTML, CSS and JavaScript, with no frameworks, no libraries and no build tools. The scripts are ordinary `<script>` files rather than ES modules so the app also runs from `file://`.

## Translations

All visible text is written in English and passed through `WO.t()`, for example `WO.t('Delete plan?')` or `WO.t('{n} days ago', { n: 3 })`. In Chinese, `WO.t()` looks the English text up in the dictionary in `js/i18n.js`; anything missing falls back to English. To add another language, add it to `LANGS` and give it its own dictionary in `DICT`. After changing any text, run `node tools/check-i18n.js` (needs Node.js): it lists any text without a Chinese translation. Muscle groups are stored in English and only translated on screen, so a backup is the same whatever the language.

## Backups

Go to **Settings → Export JSON** to download `the-workout-backup-YYYY-MM-DD.json`. **Import JSON** checks the file first, then lets you **merge** it with your current data or **replace** everything. If the file is invalid, nothing is changed.

Developers can run `node tools/check-backup.js` (needs Node.js) after changing the import code. It checks that good files pass, broken files are rejected, and missing values are filled in safely.

## Known limits

- Data is per browser and per device. Nothing syncs between them, by design.
- Clearing browser data deletes everything. The Settings page warns about this and offers a JSON backup.
- Offline caching needs `http(s)`. Opening `index.html` directly still works offline, because all the files are local anyway.
