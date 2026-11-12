/* Checks the backup import rules (validateBackup in js/views/settings.js).
   Not part of the app; run it after changing the import code:
     node tools/check-backup.js
   Exits with code 1 and names the failed check if something is wrong. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');

// A tiny fake browser: just enough for i18n.js, utils.js and settings.js to load.
const store = {};
const ctx = {
  localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  navigator: { language: 'en' },
  Intl,
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/i18n.js', 'js/utils.js', 'js/views/settings.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
ctx.WO.db = { stores: ['exercises', 'plans', 'sessions', 'sets'] }; // the real list lives in db.js
const validate = ctx.WO.backup.validate;

const backup = (data) => ({ format: 'the-workout-backup', version: 1, exported_at: '2026-10-01T10:00:00.000Z', data });
const good = () => ({
  exercises: [{ id: 'e1', name: 'Bench press', muscle_group: 'Chest', notes: '' }],
  plans: [{ id: 'p1', name: 'Push day', items: [{ exercise_id: 'e1', target_sets: 5, target_reps: 12 }] }],
  sessions: [{ id: 's1', date: '2026-10-01T09:00:00.000Z' }],
  sets: [{ id: 'x1', session_id: 's1', exercise_id: 'e1', exercise_name: 'Bench press', reps: 8, weight: 60 }],
});

// 1. A good backup passes and keeps everything.
let r = validate(backup(good()));
assert.strictEqual(r.errors.length, 0, 'good backup should pass');
assert.strictEqual(r.data.sets.length, 1, 'good backup keeps its set');

// 2. Not a backup at all, or a missing list: rejected with a message.
assert.ok(validate({ hello: 1 }).errors.length, 'random JSON should be rejected');
const noSets = good(); delete noSets.sets;
assert.ok(validate(backup(noSets)).errors.length, 'backup without its sets list should be rejected');

// 3. Broken records: rejected (so nothing is imported).
const broken = good(); broken.exercises[0].name = ''; broken.sets[0].weight = -5;
assert.strictEqual(validate(backup(broken)).errors.length, 2, 'empty name and negative weight are both reported');

// 4. Missing or odd text is filled in, so the exercise pages keep working.
const odd = good(); delete odd.exercises[0].muscle_group; odd.exercises[0].notes = 42;
r = validate(backup(odd));
assert.strictEqual(r.errors.length, 0, 'missing group/notes is not an error');
assert.strictEqual(r.data.exercises[0].muscle_group, 'Other', 'missing group becomes Other');
assert.strictEqual(r.data.exercises[0].notes, '', 'non-text notes become empty');

// 5. Sets for a missing session, and old minutes-only cardio sets, are dropped quietly.
const extra = good();
extra.sets.push({ id: 'x2', session_id: 'gone', exercise_id: 'e1', reps: 5, weight: 50 });
extra.sets.push({ id: 'x3', session_id: 's1', exercise_id: 'e1', reps: null, weight: null, duration: 30 });
r = validate(backup(extra));
// Arrays made inside the fake browser are a different kind of Array, so compare them as JSON.
assert.strictEqual(JSON.stringify(r.data.sets.map((s) => s.id)), '["x1"]', 'only the real weight × reps set is kept');

console.log('Backup import checks passed (5 groups).');
