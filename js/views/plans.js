/* ==========================================================================
   View: Workout plans (CRUD flow 2)
   #/plans          list of plans
   #/plans/new      create a plan
   #/plans/<id>     edit a plan
   ========================================================================== */
(function () {
  'use strict';
  const WO = window.WO;
  const { esc, icon, ui, t } = WO;

  const LIMITS = { sets: [1, 20], reps: [1, 30] };
  const DEFAULT_TARGET = { sets: 5, reps: 12 };

  const targetText = (item) => `${item.target_sets} × ${item.target_reps || '?'}`;

  // Rep ranges. RM ("repetition maximum") = the most reps you can do with a weight.
  const ZONES = [
    { from: 1, to: 5, cls: 'rm-strength', name: 'Strength', goal: 'Heavy weight. Builds strength and power.', sets: '3–5' },
    { from: 6, to: 12, cls: 'rm-muscle', name: 'Muscle growth', goal: 'Medium weight. Builds muscle size.', sets: '3–5' },
    { from: 13, to: 30, cls: 'rm-endurance', name: 'Endurance', goal: 'Light weight. Builds muscular endurance.', sets: '2–3' },
  ];

  /* ---------- List ---------- */
  async function renderList(root) {
    const data = await WO.db.all();
    const exMap = new Map(data.exercises.map((e) => [e.id, e]));
    const plans = data.plans.sort(WO.byName);
    const lastUsed = {};
    const timesUsed = {};
    data.sessions.forEach((s) => {
      if (!s.plan_id) return;
      timesUsed[s.plan_id] = (timesUsed[s.plan_id] || 0) + 1;
      if (!lastUsed[s.plan_id] || s.date > lastUsed[s.plan_id]) lastUsed[s.plan_id] = s.date;
    });

    function card(p) {
      const items = p.items.filter((i) => exMap.has(i.exercise_id));
      const totalSets = items.reduce((n, i) => n + (i.target_sets || 0), 0);
      const shown = items.slice(0, 5);
      return `
        <article class="card plan-card">
          <div>
            <h3>${esc(p.name)}</h3>
            ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
          </div>
          <div class="plan-meta">
            <span class="badge">${WO.fmt.plural(items.length, 'exercise')}</span>
            <span class="badge">${WO.fmt.plural(totalSets, 'set')}</span>
            ${lastUsed[p.id] ? `<span class="badge badge-success">${t('Done {count} · {when}', { count: WO.fmt.plural(timesUsed[p.id], 'time'), when: WO.fmt.relative(lastUsed[p.id]).toLowerCase() })}</span>` : `<span class="badge">${t('Not used yet')}</span>`}
          </div>
          <ul class="plan-ex">
            ${shown.map((i) => {
              const ex = exMap.get(i.exercise_id);
              return `<li><span class="type-dot type-weights" aria-hidden="true"></span><span class="name">${esc(ex.name)}</span><span class="target">${targetText(i)}</span></li>`;
            }).join('')}
            ${items.length > shown.length ? `<li class="more">${t('+ {n} more', { n: items.length - shown.length })}</li>` : ''}
          </ul>
          <div class="card-actions">
            <a class="btn btn-primary btn-sm" href="#/log/plan/${encodeURIComponent(p.id)}">${icon('play')} ${t('Start')}</a>
            <a class="btn btn-secondary btn-sm" href="#/plans/${encodeURIComponent(p.id)}">${icon('pencil')} ${t('Edit')}</a>
            <span class="spacer"></span>
            <button type="button" class="btn-icon" data-act="duplicate" data-id="${esc(p.id)}" aria-label="${t('Duplicate {name}', { name: esc(p.name) })}" title="${t('Duplicate')}">${icon('copy')}</button>
            <button type="button" class="btn-icon danger" data-act="delete" data-id="${esc(p.id)}" aria-label="${t('Delete {name}', { name: esc(p.name) })}" title="${t('Delete')}">${icon('trash')}</button>
          </div>
        </article>`;
    }

    root.innerHTML = `
      <header class="page-head">
        <div>
          <h1 tabindex="-1">${t('Workout plans')}</h1>
          <p class="subtitle">${t('Reusable routines you can start with one tap · {count}', { count: WO.fmt.plural(plans.length, 'plan') })}</p>
        </div>
        <div class="page-actions">
          <a class="btn btn-primary" href="#/plans/new">${icon('plus')} ${t('New plan')}</a>
        </div>
      </header>
      ${plans.length
        ? `<div class="grid grid-auto">${plans.map(card).join('')}</div>`
        : ui.empty({
          icon: 'clipboard', title: t('No plans yet'),
          text: t('A plan is a list of exercises with target sets and reps, like “Push day”. Make one and start it whenever you train.'),
          action: `<a class="btn btn-primary" href="#/plans/new">${icon('plus')} ${t('Create a plan')}</a>`,
        })}`;

    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const plan = plans.find((p) => p.id === btn.dataset.id);
      if (!plan) return;
      if (btn.dataset.act === 'duplicate') {
        const now = new Date().toISOString();
        const copy = Object.assign(WO.clone(plan), { id: WO.uid(), name: t('{name} (copy)', { name: plan.name }).slice(0, 60), created_at: now, updated_at: now });
        await WO.db.put('plans', copy);
        ui.toast(t('Created “{name}”', { name: copy.name }), { type: 'success' });
        WO.refresh();
      } else if (btn.dataset.act === 'delete') {
        const ok = await ui.confirm({
          title: t('Delete plan?'),
          message: t('Delete {name}? Sessions you logged with it stay in your history.', { name: `<strong>${esc(plan.name)}</strong>` }),
          confirmLabel: t('Delete'), danger: true,
        });
        if (!ok) return;
        await WO.db.remove('plans', plan.id);
        WO.refresh();
        ui.toast(t('Deleted “{name}”', { name: plan.name }), {
          action: { label: t('Undo'), fn: async () => { await WO.db.put('plans', plan); WO.refresh(); } },
        });
      }
    });
  }

  /* ---------- Editor ---------- */
  async function renderEditor(root, id) {
    const [exercises, plans] = await Promise.all([WO.db.getAll('exercises'), WO.db.getAll('plans')]);
    const exMap = new Map(exercises.map((e) => [e.id, e]));
    const existing = id ? plans.find((p) => p.id === id) : null;
    if (id && !existing) {
      root.innerHTML = ui.empty({ icon: 'alert', title: t('Plan not found'), text: t('It may have been deleted.'), action: `<a class="btn btn-primary" href="#/plans">${t('Back to plans')}</a>` });
      return;
    }
    const plan = existing ? WO.clone(existing) : { id: WO.uid(), name: '', description: '', items: [] };
    plan.items = plan.items.filter((i) => exMap.has(i.exercise_id));

    root.innerHTML = `
      <a class="back-link" href="#/plans">${icon('left')} ${t('Plans')}</a>
      <header class="page-head">
        <div>
          <h1 tabindex="-1">${t(existing ? 'Edit plan' : 'New plan')}</h1>
          <p class="subtitle">${t('Pick exercises and set a target for each one.')}</p>
        </div>
      </header>
      <form class="card form-card" id="plan-form" novalidate>
        <div class="field">
          <label for="plan-name">${t('Plan name')} <span class="req" aria-hidden="true">*</span></label>
          <input id="plan-name" class="input" maxlength="60" required autocomplete="off" placeholder="${t('e.g. Push day')}" value="${esc(plan.name)}">
        </div>
        <div class="field">
          <label for="plan-desc">${t('Description')} <span class="muted">${t('(optional)')}</span></label>
          <textarea id="plan-desc" class="input" rows="2" maxlength="200" placeholder="${t('What this plan focuses on')}">${esc(plan.description)}</textarea>
        </div>
        <div class="rm-guide">
          <h3>${t('How many reps and sets?')}</h3>
          <p class="muted small">${t('RM is the most reps you can do with a weight. Pick a weight you can lift for your target reps.')}</p>
          <div class="rm-bar" aria-hidden="true">${ZONES.map((z) => `<span class="${z.cls}"></span>`).join('')}</div>
          <div class="rm-zones">${ZONES.map((z) => `
            <div><strong>${z.from}–${z.to} RM · ${t(z.name)}</strong>${t(z.goal)} ${t('{sets} sets suggested', { sets: z.sets })}</div>`).join('')}
          </div>
        </div>
        <div class="section-title" style="margin-top:8px">
          <h2>${t('Exercises')}</h2><span class="muted small" id="item-count"></span>
        </div>
        <div class="field" id="items-field" style="margin-bottom:0">
          <ol class="plan-items" id="plan-items"></ol>
        </div>
        <button type="button" class="btn btn-secondary btn-block" data-act="add">${icon('plus')} ${t('Add exercises')}</button>
        <div class="form-foot">
          <a class="btn btn-ghost" href="#/plans">${t('Cancel')}</a>
          <button type="submit" class="btn btn-primary">${icon('check')} ${t(existing ? 'Save changes' : 'Create plan')}</button>
        </div>
      </form>`;

    const form = root.querySelector('#plan-form');
    const list = root.querySelector('#plan-items');

    function drawItems() {
      root.querySelector('#item-count').textContent = plan.items.length ? WO.fmt.plural(plan.items.length, 'exercise') : '';
      if (!plan.items.length) {
        list.innerHTML = `<li class="muted small" style="padding:6px 2px 12px">${t('No exercises yet. Add at least one.')}</li>`;
        return;
      }
      list.innerHTML = plan.items.map((item, i) => {
        const ex = exMap.get(item.exercise_id);
        const name = esc(ex.name);
        return `
          <li class="plan-item" data-i="${i}">
            <span class="plan-item-no">${i + 1}</span>
            <div class="plan-item-main">
              <strong>${name}</strong>
              <span class="muted small">${esc(t(ex.muscle_group))}</span>
            </div>
            <div class="plan-item-inputs">
              <label class="mini-field">${t('Sets')}
                <select class="input input-sm" data-field="target_sets" aria-label="${t('Target sets for {name}', { name })}">${ui.options(ui.range(...LIMITS.sets), item.target_sets)}</select>
              </label>
              <label class="mini-field">${t('Reps')}
                <select class="input input-sm" data-field="target_reps" aria-label="${t('Target reps for {name}', { name })}">${ui.options(ui.range(...LIMITS.reps), item.target_reps)}</select>
              </label>
            </div>
            <div class="plan-item-tools">
              <button type="button" class="btn-icon" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="${t('Move {name} up', { name })}">${icon('up')}</button>
              <button type="button" class="btn-icon" data-act="down" ${i === plan.items.length - 1 ? 'disabled' : ''} aria-label="${t('Move {name} down', { name })}">${icon('down')}</button>
              <button type="button" class="btn-icon danger" data-act="remove" aria-label="${t('Remove {name}', { name })}">${icon('x')}</button>
            </div>
          </li>`;
      }).join('');
    }

    list.addEventListener('input', (e) => {
      const li = e.target.closest('[data-i]');
      if (!li || !e.target.dataset.field) return;
      const v = e.target.value === '' ? null : Number(e.target.value);
      plan.items[Number(li.dataset.i)][e.target.dataset.field] = v;
    });

    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'add') {
        const picked = await WO.pickExercises({ title: t('Add exercises to plan'), already: plan.items.map((i) => i.exercise_id) });
        picked.forEach((ex) => {
          exMap.set(ex.id, ex);
          plan.items.push({ exercise_id: ex.id, target_sets: DEFAULT_TARGET.sets, target_reps: DEFAULT_TARGET.reps });
        });
        drawItems();
        return;
      }
      const li = btn.closest('[data-i]');
      if (!li) return;
      const i = Number(li.dataset.i);
      if (act === 'up' && i > 0) [plan.items[i - 1], plan.items[i]] = [plan.items[i], plan.items[i - 1]];
      if (act === 'down' && i < plan.items.length - 1) [plan.items[i + 1], plan.items[i]] = [plan.items[i], plan.items[i + 1]];
      if (act === 'remove') plan.items.splice(i, 1);
      drawItems();
      // Keep keyboard focus on the moved row's matching button.
      const target = list.querySelector(`[data-i="${act === 'up' ? i - 1 : act === 'down' ? i + 1 : Math.min(i, plan.items.length - 1)}"] [data-act="${act === 'remove' ? 'remove' : act}"]`);
      if (target && !target.disabled) target.focus();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      ui.clearErrors(form);
      let firstBad = null;
      const fail = (input, msg) => { ui.setError(input, msg); firstBad = firstBad || input; };

      const nameInput = form.querySelector('#plan-name');
      plan.name = nameInput.value.trim().replace(/\s+/g, ' ');
      plan.description = form.querySelector('#plan-desc').value.trim().slice(0, 200);
      if (!plan.name) fail(nameInput, t('Give the plan a name.'));
      else if (plans.some((p) => p.id !== plan.id && p.name.toLowerCase() === plan.name.toLowerCase())) fail(nameInput, t('You already have a plan called “{name}”.', { name: plan.name }));

      if (!plan.items.length) {
        const field = form.querySelector('#items-field');
        const err = document.createElement('p');
        err.className = 'field-error';
        err.textContent = t('Add at least one exercise to the plan.');
        field.appendChild(err);
        firstBad = firstBad || form.querySelector('[data-act="add"]');
      }

      const inRange = (v, [lo, hi]) => Number.isInteger(v) && v >= lo && v <= hi;
      list.querySelectorAll('[data-i]').forEach((li) => {
        const item = plan.items[Number(li.dataset.i)];
        const setsInput = li.querySelector('[data-field="target_sets"]');
        const repsInput = li.querySelector('[data-field="target_reps"]');
        if (!inRange(item.target_sets, LIMITS.sets)) { ui.markInvalid(setsInput, t('Sets must be a whole number from 1 to 20')); firstBad = firstBad || setsInput; }
        if (!inRange(item.target_reps, LIMITS.reps)) { ui.markInvalid(repsInput, t('Reps must be a whole number from 1 to 30')); firstBad = firstBad || repsInput; }
      });
      if (list.querySelector('.invalid')) {
        const err = document.createElement('p');
        err.className = 'field-error';
        err.textContent = t('Check the highlighted targets: sets 1–20, reps 1–30 (whole numbers).');
        form.querySelector('#items-field').appendChild(err);
      }

      if (firstBad) { firstBad.focus(); return; }

      const now = new Date().toISOString();
      plan.created_at = plan.created_at || now;
      plan.updated_at = now;
      try {
        await WO.db.put('plans', plan);
        ui.toast(existing ? t('Plan saved') : t('Created “{name}”', { name: plan.name }), { type: 'success' });
        location.hash = '#/plans';
      } catch (err) {
        ui.toast(t('Could not save: {error}', { error: err.message }), { type: 'error' });
      }
    });

    drawItems();
  }

  WO.views.plans = {
    title: 'Plans',
    nav: 'plans',
    render(root, id) { return id ? renderEditor(root, id === 'new' ? null : id) : renderList(root); },
  };
})();
