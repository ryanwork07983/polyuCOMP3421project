/* ==========================================================================
   View: Exercise library (CRUD flow 1)
   Also provides WO.exerciseForm (add/edit dialog) and WO.pickExercises
   (multi-select picker used by plans and the session logger).
   ========================================================================== */
(function () {
  'use strict';
  const WO = window.WO;
  const { esc, icon, ui, t } = WO;

  const filters = { q: '' };

  /* ---------- Add / edit dialog ---------- */
  WO.exerciseForm = function (existing, preset = {}) {
    return new Promise((resolve) => {
      WO.db.getAll('exercises').then((all) => {
        const ex = existing || { name: preset.name || '', muscle_group: preset.muscle_group || 'Chest', notes: '' };
        // Suggest the standard groups plus any the user has typed before.
        const groups = WO.GROUPS.concat([...new Set(all.map((x) => x.muscle_group))].filter((g) => !WO.GROUPS.includes(g)));
        let saved = null;
        const dlg = ui.modal({
          title: t(existing ? 'Edit exercise' : 'New exercise'),
          body: `
            <div class="field">
              <label for="ex-name">${t('Name')} <span class="req" aria-hidden="true">*</span></label>
              <input id="ex-name" class="input" maxlength="60" required autocomplete="off" autofocus
                     placeholder="${t('e.g. Bench press')}" value="${esc(ex.name)}">
            </div>
            <div class="field">
              <label for="ex-group">${t('Muscle group')}</label>
              <input id="ex-group" class="input" list="ex-group-list" maxlength="30" autocomplete="off"
                     placeholder="${t('Pick one or type your own')}" value="${esc(t(ex.muscle_group))}">
              <datalist id="ex-group-list">${groups.map((g) => `<option value="${esc(t(g))}">`).join('')}</datalist>
            </div>
            <div class="field">
              <label for="ex-notes">${t('Notes')} <span class="muted">${t('(optional)')}</span></label>
              <textarea id="ex-notes" class="input" rows="3" maxlength="300" placeholder="${t('Form cues, machine settings…')}">${esc(ex.notes)}</textarea>
            </div>`,
          footer: `<button type="button" class="btn btn-secondary" data-close>${t('Cancel')}</button>
                   <button type="submit" class="btn btn-primary">${t(existing ? 'Save changes' : 'Add exercise')}</button>`,
          onClose: () => resolve(saved),
        });

        const form = dlg.querySelector('form');

        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          ui.clearErrors(form);
          const nameInput = form.querySelector('#ex-name');
          const name = nameInput.value.trim().replace(/\s+/g, ' ');
          if (!name) { ui.setError(nameInput, t('Give the exercise a name.')); nameInput.focus(); return; }
          if (name.length > 60) { ui.setError(nameInput, t('Keep the name under 60 characters.')); nameInput.focus(); return; }
          const clash = all.find((x) => x.name.toLowerCase() === name.toLowerCase() && (!existing || x.id !== existing.id));
          if (clash) { ui.setError(nameInput, t('You already have an exercise called “{name}”.', { name: clash.name })); nameInput.focus(); return; }
          const typed = form.querySelector('#ex-group').value.trim().replace(/\s+/g, ' ').slice(0, 30);
          // A picked suggestion is shown translated; store the standard English key so it groups with the others.
          const group = groups.find((g) => t(g) === typed || g.toLowerCase() === typed.toLowerCase()) || typed || 'Other';

          const now = new Date().toISOString();
          const record = Object.assign({}, existing || { id: WO.uid(), created_at: now }, {
            name,
            muscle_group: group,
            notes: form.querySelector('#ex-notes').value.trim().slice(0, 300),
            updated_at: now,
          });
          const ops = [{ type: 'put', store: 'exercises', value: record }];
          // Keep the name shown in history in step with a rename.
          if (existing && existing.name !== name) {
            const sets = await WO.db.getAll('sets');
            sets.filter((s) => s.exercise_id === record.id).forEach((s) => {
              ops.push({ type: 'put', store: 'sets', value: Object.assign({}, s, { exercise_name: name }) });
            });
          }
          try {
            await WO.db.batch(ops);
            saved = record;
            dlg.close();
            ui.toast(existing ? t('Exercise updated') : t('Added “{name}”', { name }), { type: 'success' });
          } catch (err) {
            ui.toast(t('Could not save: {error}', { error: err.message }), { type: 'error' });
          }
        });
      });
    });
  };

  /* ---------- Picker ---------- */
  WO.pickExercises = function ({ title = t('Add exercises'), already = [] } = {}) {
    return new Promise((resolve) => {
      WO.db.getAll('exercises').then((list) => {
        const exercises = list.sort(WO.byName);
        const selected = [];
        let result = [];
        const dlg = ui.modal({
          title,
          body: `
            <label class="search">${icon('search')}
              <input type="search" class="input" placeholder="${t('Search or create an exercise')}" aria-label="${t('Search exercises')}" autofocus>
            </label>
            <div class="picker-list" role="group" aria-label="${t('Exercises')}"></div>`,
          footer: `<button type="button" class="btn btn-secondary" data-close>${t('Cancel')}</button>
                   <button type="submit" class="btn btn-primary" data-add disabled>${t('Add')}</button>`,
          onClose: () => resolve(result),
        });
        const listEl = dlg.querySelector('.picker-list');
        const search = dlg.querySelector('input[type="search"]');
        const addBtn = dlg.querySelector('[data-add]');

        function draw() {
          const q = search.value.trim().toLowerCase();
          const items = exercises.filter((e) => !q || e.name.toLowerCase().includes(q) || e.muscle_group.toLowerCase().includes(q) || t(e.muscle_group).toLowerCase().includes(q));
          let html = items.map((e) => `
            <label class="picker-item ${already.includes(e.id) ? 'is-added' : ''}">
              <input type="checkbox" value="${esc(e.id)}" ${selected.includes(e.id) ? 'checked' : ''}>
              <span class="type-dot type-weights" aria-hidden="true"></span>
              <span class="picker-name">${esc(e.name)}</span>
              <span class="muted small">${esc(t(e.muscle_group))}</span>
            </label>`).join('');
          if (!items.length && !q) html = `<p class="muted">${t('Your library is empty. Type a name to create one.')}</p>`;
          if (q && !exercises.some((e) => e.name.toLowerCase() === q)) {
            html += `<button type="button" class="picker-create" data-create>${icon('plus')} ${t('Create “{name}”', { name: esc(search.value.trim()) })}</button>`;
          }
          listEl.innerHTML = html;
          addBtn.disabled = !selected.length;
          addBtn.textContent = selected.length ? t('Add {count}', { count: WO.fmt.plural(selected.length, 'exercise') }) : t('Add');
        }

        search.addEventListener('input', draw);
        listEl.addEventListener('change', (e) => {
          if (e.target.type !== 'checkbox') return;
          const id = e.target.value;
          const i = selected.indexOf(id);
          if (e.target.checked && i < 0) selected.push(id);
          if (!e.target.checked && i >= 0) selected.splice(i, 1);
          draw();
        });
        listEl.addEventListener('click', async (e) => {
          if (!e.target.closest('[data-create]')) return;
          const created = await WO.exerciseForm(null, { name: search.value.trim() });
          if (created) {
            exercises.push(created);
            exercises.sort(WO.byName);
            selected.push(created.id);
            search.value = '';
            draw();
          }
          search.focus();
        });
        dlg.querySelector('form').addEventListener('submit', (e) => {
          e.preventDefault();
          if (!selected.length) return;
          result = selected.map((id) => exercises.find((x) => x.id === id)).filter(Boolean);
          dlg.close();
        });
        draw();
      });
    });
  };

  /* ---------- Library view ---------- */
  async function render(root) {
    const data = await WO.db.all();
    const exercises = data.exercises.sort(WO.byName);
    const planCount = {};
    data.plans.forEach((p) => p.items.forEach((i) => { planCount[i.exercise_id] = (planCount[i.exercise_id] || 0) + 1; }));
    const sessionDate = new Map(data.sessions.map((s) => [s.id, s.date]));
    const lastDone = {};
    const sessionsUsing = {};
    data.sets.forEach((s) => {
      const d = sessionDate.get(s.session_id);
      if (!d) return;
      if (!lastDone[s.exercise_id] || d > lastDone[s.exercise_id]) lastDone[s.exercise_id] = d;
      (sessionsUsing[s.exercise_id] = sessionsUsing[s.exercise_id] || new Set()).add(s.session_id);
    });

    root.innerHTML = `
      <header class="page-head">
        <div>
          <h1 tabindex="-1">${t('Exercises')}</h1>
          <p class="subtitle">${t('Your personal library · {count}', { count: WO.fmt.plural(exercises.length, 'exercise') })}</p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn btn-primary" data-act="add">${icon('plus')} ${t('New exercise')}</button>
        </div>
      </header>
      <div class="toolbar">
        <label class="search">${icon('search')}
          <input type="search" class="input" placeholder="${t('Search by name or muscle group')}" aria-label="${t('Search exercises')}" value="${esc(filters.q)}">
        </label>
      </div>
      <div id="ex-results" aria-live="polite"></div>`;

    const results = root.querySelector('#ex-results');

    function card(e) {
      const bits = [];
      if (planCount[e.id]) bits.push(t('In {count}', { count: WO.fmt.plural(planCount[e.id], 'plan') }));
      bits.push(lastDone[e.id] ? t('Last done {when}', { when: WO.fmt.relative(lastDone[e.id]).toLowerCase() }) : t('Not logged yet'));
      return `
        <article class="card ex-card">
          <div class="ex-card-top">
            <span class="type-dot type-weights" aria-hidden="true"></span>
            <h3>${esc(e.name)}</h3>
          </div>
          ${e.notes ? `<p class="notes">${esc(e.notes)}</p>` : ''}
          <p class="meta">${bits.join(' · ')}</p>
          <div class="card-actions">
            <button type="button" class="btn-icon" data-act="edit" data-id="${esc(e.id)}" aria-label="${t('Edit {name}', { name: esc(e.name) })}">${icon('pencil')}</button>
            <button type="button" class="btn-icon danger" data-act="delete" data-id="${esc(e.id)}" aria-label="${t('Delete {name}', { name: esc(e.name) })}">${icon('trash')}</button>
          </div>
        </article>`;
    }

    function draw() {
      const q = filters.q.trim().toLowerCase();
      const shown = exercises.filter((e) =>
        !q || e.name.toLowerCase().includes(q) || e.muscle_group.toLowerCase().includes(q) || t(e.muscle_group).toLowerCase().includes(q) || (e.notes || '').toLowerCase().includes(q));
      if (!exercises.length) {
        results.innerHTML = ui.empty({
          icon: 'dumbbell', title: t('No exercises yet'),
          text: t('Add the exercises you do, or load the starter library from Settings.'),
          action: `<button type="button" class="btn btn-primary" data-act="add">${icon('plus')} ${t('Add your first exercise')}</button>`,
        });
        return;
      }
      if (!shown.length) {
        results.innerHTML = ui.empty({
          icon: 'search', title: t('Nothing matches'),
          text: t('No exercise matches “{q}”.', { q: esc(filters.q) }),
          action: `<button type="button" class="btn btn-secondary" data-act="add-named">${icon('plus')} ${t('Create “{name}”', { name: esc(filters.q.trim()) })}</button>`,
        });
        return;
      }
      const groups = WO.GROUPS.concat([...new Set(shown.map((e) => e.muscle_group))].filter((g) => !WO.GROUPS.includes(g)));
      results.innerHTML = groups.map((g) => {
        const items = shown.filter((e) => e.muscle_group === g);
        if (!items.length) return '';
        return `<h2 class="group-title">${esc(t(g))} <span>${items.length}</span></h2>
                <div class="grid grid-auto">${items.map(card).join('')}</div>`;
      }).join('');
    }

    root.addEventListener('input', (e) => {
      if (e.target.type === 'search') { filters.q = e.target.value; draw(); }
    });

    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'add' || act === 'add-named') {
        const created = await WO.exerciseForm(null, act === 'add-named' ? { name: filters.q.trim() } : {});
        if (created) { filters.q = ''; WO.refresh(); }
      } else if (act === 'edit') {
        const ex = exercises.find((x) => x.id === btn.dataset.id);
        if (ex && await WO.exerciseForm(ex)) WO.refresh();
      } else if (act === 'delete') {
        const ex = exercises.find((x) => x.id === btn.dataset.id);
        if (ex) remove(ex);
      }
    });

    async function remove(ex) {
      const plans = data.plans.filter((p) => p.items.some((i) => i.exercise_id === ex.id));
      const used = sessionsUsing[ex.id] ? sessionsUsing[ex.id].size : 0;
      let msg = t('Delete {name} from your library?', { name: `<strong>${esc(ex.name)}</strong>` });
      if (plans.length) msg += ' ' + t('It will be removed from {count} ({names}).', { count: WO.fmt.plural(plans.length, 'plan'), names: plans.map((p) => esc(p.name)).join(', ') });
      if (used) msg += ' ' + t('Your {count} will keep their records.', { count: WO.fmt.plural(used, 'past session') });
      const ok = await ui.confirm({ title: t('Delete exercise?'), message: msg, confirmLabel: t('Delete'), danger: true });
      if (!ok) return;
      const ops = [{ type: 'delete', store: 'exercises', id: ex.id }];
      plans.forEach((p) => ops.push({
        type: 'put', store: 'plans',
        value: Object.assign({}, p, { items: p.items.filter((i) => i.exercise_id !== ex.id), updated_at: new Date().toISOString() }),
      }));
      await WO.db.batch(ops);
      WO.refresh();
      ui.toast(t('Deleted “{name}”', { name: ex.name }), {
        action: {
          label: t('Undo'),
          fn: async () => {
            await WO.db.batch([{ type: 'put', store: 'exercises', value: ex }].concat(plans.map((p) => ({ type: 'put', store: 'plans', value: p }))));
            WO.refresh();
          },
        },
      });
    }

    draw();
  }

  WO.views.exercises = { title: 'Exercises', nav: 'exercises', render };
})();
