/* ==========================================================================
   View: Settings (#/settings)
   Appearance, language, units, rest timer, and data: backup (export),
   restore (import), storage status, sample data and erasing everything.
   ========================================================================== */
(function () {
  'use strict';
  const WO = window.WO;
  const { esc, icon, ui, t } = WO;

  const BACKUP_FORMAT = 'the-workout-backup';
  const BACKUP_VERSION = 1;

  /* ---------- Export ---------- */
  async function exportData() {
    const data = await WO.db.all();
    const s = WO.settings.get();
    const backup = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      settings: { units: s.units, theme: s.theme, restSeconds: s.restSeconds, sound: s.sound, autoRest: s.autoRest },
      data,
    };
    ui.download(`the-workout-backup-${WO.dates.isoDay(new Date())}.json`, JSON.stringify(backup, null, 2));
    WO.settings.set({ lastExport: new Date().toISOString() });
    ui.toast(t('Backup saved: {sessions}, {exercises}', { sessions: WO.fmt.plural(data.sessions.length, 'session'), exercises: WO.fmt.plural(data.exercises.length, 'exercise') }), { type: 'success' });
  }

  /* ---------- Import: check the file carefully before touching storage ---------- */
  const isStr = (v) => typeof v === 'string' && v.length > 0;
  const isNum = (v) => v == null || (typeof v === 'number' && isFinite(v) && v >= 0);

  function validateBackup(obj) {
    const errors = [];
    if (!obj || typeof obj !== 'object') return { errors: [t('This file is not a backup from The Workout.')] };
    if (obj.format !== BACKUP_FORMAT || !obj.data) return { errors: [t('This file is not a backup from The Workout.')] };
    if (obj.version > BACKUP_VERSION) return { errors: [t('This backup was made by a newer version of the app.')] };
    const d = obj.data;
    const lists = {};
    for (const store of WO.db.stores) {
      if (!Array.isArray(d[store])) return { errors: [t('The backup is missing its “{store}” list.', { store })] };
      lists[store] = d[store];
    }
    const bad = (store, i, why) => { if (errors.length < 8) errors.push(`${t(store)} #${i + 1}: ${why}`); };

    lists.exercises.forEach((e, i) => {
      if (!isStr(e.id)) bad('Exercise', i, t('missing id'));
      else if (!isStr(e.name) || e.name.length > 60) bad('Exercise', i, t('name is missing or too long'));
      // The app searches these as text, so a missing or odd value would break the exercise pages.
      if (!isStr(e.muscle_group)) e.muscle_group = 'Other';
      if (typeof e.notes !== 'string') e.notes = '';
    });
    lists.plans.forEach((p, i) => {
      if (!isStr(p.id) || !isStr(p.name)) bad('Plan', i, t('missing id or name'));
      else if (!Array.isArray(p.items) || p.items.some((it) => !isStr(it.exercise_id))) bad('Plan', i, t('exercise list is broken'));
    });
    lists.sessions.forEach((s, i) => {
      if (!isStr(s.id)) bad('Session', i, t('missing id'));
      else if (!isStr(s.date) || isNaN(new Date(s.date).getTime())) bad('Session', i, t('date is not valid'));
    });
    const sessionIds = new Set(lists.sessions.map((s) => s.id));
    lists.sets.forEach((s, i) => {
      if (!isStr(s.id) || !isStr(s.session_id) || !isStr(s.exercise_id)) bad('Set', i, t('missing id, session or exercise'));
      else if (![s.reps, s.weight].every(isNum)) bad('Set', i, t('has a value that is not a positive number'));
    });
    if (errors.length) return { errors };
    // Dropped quietly: sets that point to a missing session, and old minutes-only (cardio) sets with no reps.
    lists.sets = lists.sets.filter((s) => sessionIds.has(s.session_id) && s.reps > 0);
    lists.sets.forEach((s) => { if (!isStr(s.exercise_name)) s.exercise_name = t('Exercise'); });
    return { errors: [], data: lists, settings: obj.settings, exportedAt: obj.exported_at };
  }

  function importFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { ui.toast(t('That file is too large to be a backup'), { type: 'error' }); return; }
    const reader = new FileReader();
    reader.onerror = () => ui.toast(t('Could not read the file'), { type: 'error' });
    reader.onload = async () => {
      let parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) {
        ui.toast(t('The file is not valid JSON'), { type: 'error' });
        return;
      }
      const result = validateBackup(parsed);
      if (result.errors.length) {
        ui.modal({
          title: t('Can’t import this file'),
          body: `<div class="form-error">${icon('alert')}<span>${t('Nothing was changed. The file has problems:')}</span></div>
                 <ul>${result.errors.map((e) => `<li>${e}</li>`).join('')}</ul>`,
          footer: `<button type="button" class="btn btn-primary" data-close autofocus>${t('OK')}</button>`,
        });
        return;
      }
      chooseImportMode(result);
    };
    reader.readAsText(file);
  }

  function chooseImportMode(result) {
    const d = result.data;
    let mode = null;
    const dlg = ui.modal({
      title: t('Restore backup'),
      body: `
        <p>${result.exportedAt ? t('This backup from {date} contains:', { date: `<strong>${WO.fmt.date(result.exportedAt)}</strong>` }) : t('This backup contains:')}</p>
        <div class="storage-stats" style="margin:14px 0">
          <div><div class="v">${d.exercises.length}</div><div class="k">${t('Exercises')}</div></div>
          <div><div class="v">${d.plans.length}</div><div class="k">${t('Plans')}</div></div>
          <div><div class="v">${d.sessions.length}</div><div class="k">${t('Sessions')}</div></div>
          <div><div class="v">${d.sets.length}</div><div class="k">${t('Sets')}</div></div>
        </div>
        <fieldset class="field">
          <legend>${t('How should it be restored?')}</legend>
          <label class="picker-item"><input type="radio" name="mode" value="merge" checked>
            <span><strong>${t('Merge')}</strong><br><span class="muted small">${t("Add the backup to what you have. Records with the same id are replaced by the backup's version.")}</span></span></label>
          <label class="picker-item"><input type="radio" name="mode" value="replace">
            <span><strong>${t('Replace everything')}</strong><br><span class="muted small">${t('Delete all current data first, then restore the backup exactly.')}</span></span></label>
        </fieldset>`,
      footer: `<button type="button" class="btn btn-secondary" data-close>${t('Cancel')}</button>
               <button type="submit" class="btn btn-primary">${icon('upload')} ${t('Restore')}</button>`,
    });
    dlg.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      mode = dlg.querySelector('input[name="mode"]:checked').value;
      if (mode === 'replace') {
        const ok = await ui.confirm({
          title: t('Replace all data?'),
          message: t('Everything currently in the app will be deleted and replaced by the backup. This can’t be undone.'),
          confirmLabel: t('Replace everything'), danger: true,
        });
        if (!ok) return;
      }
      const ops = [];
      if (mode === 'replace') WO.db.stores.forEach((store) => ops.push({ type: 'clear', store }));
      WO.db.stores.forEach((store) => d[store].forEach((value) => ops.push({ type: 'put', store, value })));
      try {
        await WO.db.batch(ops);
      } catch (err) {
        ui.toast(t('Restore failed, nothing was changed: {error}', { error: err.message }), { type: 'error' });
        return;
      }
      if (mode === 'replace') WO.draft.clear();
      if (result.settings && typeof result.settings === 'object') {
        const s = result.settings;
        const patch = {};
        if (s.units === 'kg' || s.units === 'lb') patch.units = s.units;
        if (['system', 'light', 'dark'].includes(s.theme)) patch.theme = s.theme;
        if (Number.isInteger(s.restSeconds) && s.restSeconds >= 0 && s.restSeconds <= 1200) patch.restSeconds = s.restSeconds;
        WO.settings.set(patch);
        WO.applyTheme();
        // The language is not restored: the person importing already picked the one they read.
      }
      dlg.close();
      ui.toast(t('Backup restored: {sessions}', { sessions: WO.fmt.plural(d.sessions.length, 'session') }), { type: 'success' });
      WO.refresh();
    });
  }

  /* ---------- Erase everything ---------- */
  function eraseAll() {
    const dlg = ui.modal({
      title: t('Erase all data?'),
      body: `
        <div class="form-error">${icon('alert')}<span>${t('This permanently deletes every exercise, plan and workout on this device. It can’t be undone.')}</span></div>
        <p>${t('If you might want your data later, export a backup first.')}</p>
        <div class="field" style="margin-top:14px">
          <label for="erase-confirm">${t('Type {word} to confirm', { word: '<strong>DELETE</strong>' })}</label>
          <input id="erase-confirm" class="input" autocomplete="off" autofocus>
        </div>`,
      footer: `<button type="button" class="btn btn-secondary" data-close>${t('Cancel')}</button>
               <button type="submit" class="btn btn-danger" disabled>${icon('trash')} ${t('Erase everything')}</button>`,
    });
    const input = dlg.querySelector('#erase-confirm');
    const btn = dlg.querySelector('button[type="submit"]');
    input.addEventListener('input', () => { btn.disabled = input.value.trim() !== 'DELETE'; });
    dlg.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (input.value.trim() !== 'DELETE') return;
      await WO.db.batch(WO.db.stores.map((store) => ({ type: 'clear', store })));
      WO.draft.clear();
      WO.timer.stop();
      dlg.close();
      ui.toast(t('All data erased'), { type: 'success' });
      WO.refresh();
    });
  }

  /* ---------- View ---------- */
  async function render(root) {
    const data = await WO.db.all();
    const s = WO.settings.get();
    const hasDemo = data.sessions.some((x) => x.demo);

    let usage = null;
    try {
      if (navigator.storage && navigator.storage.estimate) usage = await navigator.storage.estimate();
    } catch (e) { /* not supported on this origin */ }

    const engine = WO.db.engine;
    const engineStatus = engine === 'IndexedDB' ? '' : engine === 'localStorage' ? 'warn' : 'bad';
    const sizeKb = Math.max(1, Math.round(JSON.stringify(data).length / 1024));
    const langs = WO.i18n.langs;

    root.innerHTML = `
      <header class="page-head">
        <div><h1 tabindex="-1">${t('Settings')}</h1><p class="subtitle">${t('Preferences and your data')}</p></div>
      </header>

      <section class="card settings-section">
        <h2>${t('Preferences')}</h2>
        <p class="section-desc">${t('Saved in this browser.')}</p>
        <div class="setting-row">
          <div class="setting-text"><strong>${t('Language')}</strong><span>${t('Changes the words in the app. Your own exercise and plan names stay as you typed them.')}</span></div>
          <div class="segmented" role="group" aria-label="${t('Language')}">
            ${Object.keys(langs).map((code) => `<button type="button" data-lang="${code}" lang="${code}" aria-pressed="${WO.i18n.lang === code}">${langs[code].label}</button>`).join('')}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-text"><strong>${t('Theme')}</strong><span>${t('Follow your device, or pick one.')}</span></div>
          <div class="segmented" role="group" aria-label="${t('Theme')}">
            ${['system', 'light', 'dark'].map((th) => `<button type="button" data-theme-btn="${th}" aria-pressed="${s.theme === th}">${t(th[0].toUpperCase() + th.slice(1))}</button>`).join('')}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-text"><strong>${t('Weight units')}</strong><span>${t('Weights are stored in kg and converted for display.')}</span></div>
          <div class="segmented" role="group" aria-label="${t('Weight units')}">
            ${['kg', 'lb'].map((u) => `<button type="button" data-units="${u}" aria-pressed="${s.units === u}">${u}</button>`).join('')}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-text"><strong>${t('Rest timer length')}</strong><span>${t('Used when you tick off a set. 0 turns the timer off.')}</span></div>
          <div class="rest-pickers">
            <label class="mini-field">${t('Min')}
              <select class="input input-sm" id="rest-min" aria-label="${t('Rest minutes')}">${ui.options(ui.range(0, 20), Math.floor(s.restSeconds / 60))}</select>
            </label>
            <label class="mini-field">${t('Sec')}
              <select class="input input-sm" id="rest-sec" aria-label="${t('Rest seconds')}">${ui.options(ui.range(0, 59), s.restSeconds % 60)}</select>
            </label>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-text"><strong>${t('Start rest timer automatically')}</strong><span>${t('When you mark a set done.')}</span></div>
          <label class="switch"><input type="checkbox" id="auto-rest" ${s.autoRest ? 'checked' : ''}><span class="track"></span><span class="sr-only">${t('Start rest timer automatically')}</span></label>
        </div>
        <div class="setting-row">
          <div class="setting-text"><strong>${t('Timer sound')}</strong><span>${t('Beep (and vibrate on phones) when rest is over.')}</span></div>
          <label class="switch"><input type="checkbox" id="sound" ${s.sound ? 'checked' : ''}><span class="track"></span><span class="sr-only">${t('Timer sound')}</span></label>
        </div>
      </section>

      <section class="card settings-section" id="data">
        <h2>${t('Your data')}</h2>
        <p class="section-desc">${t('Everything is stored only in this browser on this device. Nothing is uploaded, and there is no account.')}</p>

        <div class="data-warning" role="note">
          ${icon('alert')}
          <div>
            <strong>${t('Your data can be lost. Export a backup regularly.')}</strong>
            ${t("Because there is no server, your workouts exist only in this browser's storage. You will lose them if you:")}
            <ul>
              <li>${t('clear your browsing data, cookies or site data for this page,')}</li>
              <li>${t('use a private or incognito window (it is wiped when you close it),')}</li>
              <li>${t('uninstall the browser, reset the device, or switch to another browser or device,')}</li>
              <li>${t('run low on disk space (some browsers then delete site data on their own).')}</li>
            </ul>
          </div>
        </div>

        <div class="storage-stats">
          <div><div class="v">${data.exercises.length}</div><div class="k">${t('Exercises')}</div></div>
          <div><div class="v">${data.plans.length}</div><div class="k">${t('Plans')}</div></div>
          <div><div class="v">${data.sessions.length}</div><div class="k">${t('Sessions')}</div></div>
          <div><div class="v">${data.sets.length}</div><div class="k">${t('Sets logged')}</div></div>
        </div>

        <div class="setting-row">
          <div class="setting-text">
            <strong>${t('Storage')}</strong>
            <span><span class="status-pill ${engineStatus}">${esc(t(engine))}</span> · ${t('about {n} KB', { n: sizeKb })}
            ${engine === 'localStorage' ? ' · ' + t('IndexedDB was not available, so the simpler localStorage is used.') : ''}
            ${engine === 'Memory only' ? ' · ' + t('This browser blocks storage. Data will be lost when you close the tab.') : ''}
            ${usage && usage.quota ? ' · ' + t('{n} MB available to this site', { n: WO.fmt.int(Math.round(usage.quota / 1048576)) }) : ''}</span>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-text">
            <strong>${t('Export backup')}</strong>
            <span>${t('Download everything as a JSON file.')} ${s.lastExport ? t('Last export: {date}.', { date: WO.fmt.date(s.lastExport) }) : t('You have not exported a backup yet.')}</span>
          </div>
          <button type="button" class="btn btn-primary" data-act="export">${icon('download')} ${t('Export JSON')}</button>
        </div>
        <div class="setting-row">
          <div class="setting-text">
            <strong>${t('Import backup')}</strong>
            <span>${t('Restore from a JSON file exported by The Workout. You can merge it or replace everything.')}</span>
          </div>
          <label class="btn btn-secondary" tabindex="0" role="button" id="import-label">${icon('upload')} ${t('Import JSON')}
            <input type="file" accept="application/json,.json" id="import-file" class="sr-only" tabindex="-1">
          </label>
        </div>
      </section>

      <section class="card settings-section">
        <h2>${t('Sample data')}</h2>
        <p class="section-desc">${t('Handy for trying the app or giving a demo.')}</p>
        <div class="setting-row">
          <div class="setting-text"><strong>${t('Starter exercises and plans')}</strong><span>${t('Re-add any of the 18 starter exercises and 3 sample plans you deleted. Your own data is kept.')}</span></div>
          <button type="button" class="btn btn-secondary" data-act="starter">${icon('dumbbell')} ${t('Restore starters')}</button>
        </div>
        <div class="setting-row">
          <div class="setting-text"><strong>${t('Demo history')}</strong><span>${t(hasDemo ? 'Demo sessions are loaded. Remove them before you start tracking for real.' : 'Adds about 8 weeks of example workouts so the charts have something to show.')}</span></div>
          ${hasDemo
            ? `<button type="button" class="btn btn-secondary" data-act="demo-remove">${icon('trash')} ${t('Remove demo history')}</button>`
            : `<button type="button" class="btn btn-secondary" data-act="demo">${icon('sparkle')} ${t('Load demo history')}</button>`}
        </div>
      </section>

      <section class="card settings-section danger-zone">
        <h2>${t('Danger zone')}</h2>
        <div class="setting-row">
          <div class="setting-text"><strong>${t('Erase all data')}</strong><span>${t('Delete every exercise, plan and workout from this browser.')}</span></div>
          <button type="button" class="btn btn-danger" data-act="erase">${icon('trash')} ${t('Erase all data')}</button>
        </div>
      </section>

      <section class="card settings-section">
        <h2>${t('About')}</h2>
        <p class="section-desc" style="margin-bottom:0">${t('The Workout · version 1.0 · COMP3421 project. Free, no ads, no tracking, no account. Works offline.')}</p>
      </section>`;

    root.addEventListener('click', async (e) => {
      const langBtn = e.target.closest('[data-lang]');
      if (langBtn) {
        if (langBtn.dataset.lang === WO.i18n.lang) return;
        // i18n.js reads the choice from localStorage on load, so a reload without it would undo the switch.
        if (!WO.local.works) { ui.toast(t('This browser blocks storage, so the language can’t be saved.'), { type: 'error' }); return; }
        WO.settings.set({ lang: langBtn.dataset.lang });
        // Reload so every formatter, label and cached string is rebuilt in the new language.
        location.reload();
        return;
      }
      const themeBtn = e.target.closest('[data-theme-btn]');
      if (themeBtn) {
        WO.settings.set({ theme: themeBtn.dataset.themeBtn });
        WO.applyTheme();
        root.querySelectorAll('[data-theme-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b === themeBtn)));
        return;
      }
      const unitBtn = e.target.closest('[data-units]');
      if (unitBtn) {
        WO.settings.set({ units: unitBtn.dataset.units });
        root.querySelectorAll('[data-units]').forEach((b) => b.setAttribute('aria-pressed', String(b === unitBtn)));
        ui.toast(t('Weights now shown in {units}', { units: unitBtn.dataset.units }), { type: 'success' });
        return;
      }
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'export') { await exportData(); WO.refresh(); }
      if (act === 'erase') eraseAll();
      if (act === 'starter') {
        const n = await WO.seed.loadStarter();
        ui.toast(n ? t('Restored {count}', { count: WO.fmt.plural(n, 'item') }) : t('All starter exercises and plans are already there'), { type: 'success' });
        WO.refresh();
      }
      if (act === 'demo') {
        const n = await WO.seed.loadDemo();
        ui.toast(t('Loaded {count}', { count: WO.fmt.plural(n, 'demo session') }), { type: 'success' });
        WO.refresh();
      }
      if (act === 'demo-remove') {
        const n = await WO.seed.removeDemo();
        ui.toast(t('Removed {count}', { count: WO.fmt.plural(n, 'demo session') }), { type: 'success' });
        WO.refresh();
      }
    });

    root.querySelector('#import-label').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); root.querySelector('#import-file').click(); }
    });
    root.addEventListener('change', (e) => {
      if (e.target.id === 'import-file') { importFile(e.target.files[0]); e.target.value = ''; }
      if (e.target.id === 'rest-min' || e.target.id === 'rest-sec') {
        // Up to 20:00 in total, so 20 minutes resets the seconds to 0.
        const total = Math.min(1200, Number(root.querySelector('#rest-min').value) * 60 + Number(root.querySelector('#rest-sec').value));
        WO.settings.set({ restSeconds: total });
        root.querySelector('#rest-sec').value = String(total % 60);
      }
      if (e.target.id === 'auto-rest') WO.settings.set({ autoRest: e.target.checked });
      if (e.target.id === 'sound') WO.settings.set({ sound: e.target.checked });
    });
  }

  WO.views.settings = { title: 'Settings', nav: 'settings', render };
  WO.backup = { validate: validateBackup }; // used by tools/check-backup.js
})();
