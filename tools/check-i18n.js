/* Checks that every text passed to t() / WO.t() has a 繁體中文 translation
   with the same {slots}. Not part of the app; run it after changing any text:
     node tools/check-i18n.js
   Exits with code 1 and lists the problems if something is missing. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// Load the dictionary by running i18n.js in a tiny fake browser.
const ctx = { window: {}, localStorage: { getItem: () => null }, navigator: { language: 'en' } };
vm.runInNewContext(read('js/i18n.js'), ctx);
const dict = ctx.window.WO.i18n.dict['zh-Hant'];

const files = ['js/utils.js', 'js/app.js', 'js/stats.js', 'js/timer.js', 'js/charts.js', 'js/seed.js']
  .concat(fs.readdirSync(path.join(root, 'js/views')).map((f) => 'js/views/' + f));

// Collect the quoted strings in the first argument of every t( ... ) call.
const used = new Set();
for (const f of files) {
  const src = read(f);
  const re = /\bt\(/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 0, quote = null, arg = '';
    for (let i = m.index + 2; i < src.length; i++) {
      const c = src[i];
      if (quote) { arg += c; if (c === quote) quote = null; continue; }
      if (c === "'" || c === '"' || c === '`') { quote = c; arg += c; continue; }
      if ('({['.includes(c)) depth++;
      if (')}]'.includes(c)) { if (depth === 0) break; depth--; }
      if (c === ',' && depth === 0) break;
      arg += c;
    }
    for (const s of arg.matchAll(/'([^']*)'|"([^"]*)"/g)) used.add(s[1] ?? s[2]);
  }
}

// Text translated through a variable, e.g. t(group), t(view.title), plural words, index.html.
['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Full body', 'Other', 'Exercise', 'Plan', 'Session', 'Set',
  'Memory only', 'Weight', 'Reps', 'System', 'Light', 'Dark',
  'Strength', 'Muscle growth', 'Endurance', 'Heavy weight. Builds strength and power.', 'Medium weight. Builds muscle size.', 'Light weight. Builds muscular endurance.',
  'Home', 'Exercises', 'Plans', 'Log workout', 'History', 'Settings', 'Skip to content', 'Log',
  'Private by design. Your data never leaves this browser.', 'Loading your workouts…']
  .concat(['time', 'set', 'workout', 'week', 'exercise', 'plan', 'past session', 'session', 'item', 'demo session'].map((w) => '{n} ' + w))
  .forEach((s) => used.add(s));

// Starter exercises and plans are translated when they are created.
const seed = read('js/seed.js');
for (const m of seed.matchAll(/\['[\w-]+', '([^']+)', '[^']+', '([^']*)'\]/g)) { used.add(m[1]); if (m[2]) used.add(m[2]); }
for (const m of seed.matchAll(/name: '([^']+)', description: '([^']+)'/g)) { used.add(m[1]); used.add(m[2]); }

// Values compared inside t(...) and names that read the same in every language.
const notText = new Set(['{n} ', 'IndexedDB', 'localStorage']);
const missing = [...used].filter((s) => /[a-z]/i.test(s) && !notText.has(s) && !(s in dict));
const slots = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
const badSlots = Object.keys(dict).filter((k) => slots(k) !== slots(dict[k]));

if (missing.length) console.log('Missing translations:\n  ' + missing.join('\n  '));
if (badSlots.length) console.log('Different {slots} in the translation:\n  ' + badSlots.join('\n  '));
console.log(`${used.size} texts checked, ${Object.keys(dict).length} translations.`);
process.exitCode = missing.length || badSlots.length ? 1 : 0;
