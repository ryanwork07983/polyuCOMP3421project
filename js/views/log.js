/* ==========================================================================
   View: Log session (CRUD flow 3: create and update sessions)
   #/log               start screen, or the workout in progress
   #/log/plan/<id>     start a workout from a plan
   #/log/edit/<id>     edit a saved session
   The workout in progress is a "draft" kept in localStorage, so a refresh
   or a closed tab never loses sets you already typed.
   ========================================================================== */
(function () {
  'use strict';
  const WO = window.WO;
  const { esc, icon, ui, t } = WO;

  const DRAFT_KEY = 'the-workout:draft';
  const LIMITS = { weight: 1000, reps: 1000 };
  const DEFAULT_SETS = 5;
  const DEFAULT_REPS = 12;
  const REP_CHOICES = ui.range(1, 100);
  const WEIGHT_STEP_KG = 2.5;
  // shortcut: the weight picker stops at 300 kg / 660 lb (a heavier saved value is still added to the list); extend if someone lifts more.
  const WEIGHT_CHOICES = {
    kg: ui.range(0, 100, 0.5).concat(ui.range(102.5, 300, 2.5)),
    lb: ui.range(0, 220, 1).concat(ui.range(225, 660, 5)),
  };

  const Draft = (WO.draft = {
    get: () => WO.local.getJSON(DRAFT_KEY, null),
    save: (d) => WO.local.setJSON(DRAFT_KEY, d),
    clear: () => WO.local.remove(DRAFT_KEY),
    // Pickers are pre-filled, so only ticked sets count as progress.
    hasProgress: (d) => !!d && d.blocks.some((b) => b.sets.some((s) => s.done)),
  });

  // A new set copies the set above it; empty values are filled in from last time when the workout is drawn.
  const newSet = (prev) => ({ key: WO.uid(), weight: prev ? prev.weight : null, reps: prev ? prev.reps : null, done: false });

  function newBlock(ex, item) {
    const count = item ? item.target_sets : DEFAULT_SETS;
    return {
      key: WO.uid(), exercise_id: ex.id, exercise_name: ex.name,
      target: item ? { sets: item.target_sets, reps: item.target_reps } : null,
      sets: Array.from({ length: Math.max(1, count || 1) }, () => newSet()),
    };
  }

  function newDraft(plan, exMap) {
    const now = new Date().toISOString();
    return {
      id: WO.uid(), editing: false, plan_id: plan ? plan.id : null, plan_name: plan ? plan.name : null,
      startedAt: now, date: now, duration: null, notes: '',
      blocks: plan ? plan.items.filter((i) => exMap.has(i.exercise_id)).map((i) => newBlock(exMap.get(i.exercise_id), i)) : [],
    };
  }

  // `next` is already-escaped HTML describing what happens after discarding.
  async function confirmReplace(next) {
    const current = Draft.get();
    if (!Draft.hasProgress(current)) return true;
    const name = current.plan_name ? ` (<strong>${esc(current.plan_name)}</strong>)` : '';
    return ui.confirm({
      title: t('Workout in progress'),
      message: t(current.editing ? 'You have an unsaved edit{name}. Discard it and {next}?' : 'You have an unsaved workout{name}. Discard it and {next}?', { name, next }),
      confirmLabel: t('Discard and continue'), danger: true,
    });
  }

  async function startFromPlan(planId) {
    const current = Draft.get();
    if (current && !current.editing && current.plan_id === planId) return; // already doing this plan
    const [plans, exercises] = await Promise.all([WO.db.getAll('plans'), WO.db.getAll('exercises')]);
    const plan = plans.find((p) => p.id === planId);
    if (!plan) { ui.toast(t('That plan no longer exists'), { type: 'error' }); return; }
    if (!(await confirmReplace(t('start {name}', { name: esc(plan.name) })))) return;
    Draft.save(newDraft(plan, new Map(exercises.map((e) => [e.id, e]))));
  }

  async function startEdit(sessionId) {
    const current = Draft.get();
    if (current && current.editing && current.id === sessionId) return;
    const [session, sets] = await Promise.all([WO.db.get('sessions', sessionId), WO.db.getAll('sets')]);
    if (!session) { ui.toast(t('That session no longer exists'), { type: 'error' }); return; }
    if (!(await confirmReplace(t('edit this session')))) return;
    const own = WO.stats.bySession(sets.filter((s) => s.session_id === sessionId)).get(sessionId) || [];
    const draft = {
      id: session.id, editing: true, plan_id: session.plan_id, plan_name: session.plan_name,
      startedAt: session.date, date: session.date, duration: session.duration, notes: session.notes || '',
      created_at: session.created_at, demo: session.demo,
      blocks: WO.stats.exerciseGroups(own).map((g) => ({
        key: WO.uid(), exercise_id: g.exercise_id, exercise_name: g.name, target: null,
        sets: g.sets.map((s) => ({ key: WO.uid(), weight: s.weight, reps: s.reps, done: true })),
      })),
    };
    Draft.save(draft);
  }

  /* ---------- Start screen ---------- */
  async function renderStart(root) {
    const [plans, exercises, sessions] = await Promise.all([WO.db.getAll('plans'), WO.db.getAll('exercises'), WO.db.getAll('sessions')]);
    const exMap = new Map(exercises.map((e) => [e.id, e]));
    const lastUsed = {};
    sessions.forEach((s) => { if (s.plan_id && (!lastUsed[s.plan_id] || s.date > lastUsed[s.plan_id])) lastUsed[s.plan_id] = s.date; });
    // Plans you haven't done for the longest time come first: that's usually the one that's next.
    plans.sort((a, b) => (lastUsed[a.id] || '').localeCompare(lastUsed[b.id] || '') || WO.byName(a, b));

    root.innerHTML = `
      <header class="page-head">
        <div>
          <h1 tabindex="-1">${t('Log a workout')}</h1>
          <p class="subtitle">${t('Start from one of your plans, or start empty and add exercises as you go.')}</p>
        </div>
      </header>
      <div class="grid start-grid">
        <button type="button" class="card start-card start-empty" data-act="empty">
          <span class="start-icon">${icon('plus')}</span>
          <h3>${t('Empty workout')}</h3>
          <p>${t('Add exercises as you go.')}</p>
        </button>
        ${plans.map((p) => {
          const names = p.items.map((i) => exMap.get(i.exercise_id)).filter(Boolean).map((e) => e.name);
          return `
            <button type="button" class="card start-card" data-plan="${esc(p.id)}">
              <span class="start-icon">${icon('clipboard')}</span>
              <h3>${esc(p.name)}</h3>
              <p>${esc(names.slice(0, 4).join(', '))}${names.length > 4 ? ` +${names.length - 4}` : ''}</p>
              <p class="small">${lastUsed[p.id] ? t('Last done {when}', { when: WO.fmt.relative(lastUsed[p.id]).toLowerCase() }) : t('Not done yet')}</p>
            </button>`;
        }).join('')}
      </div>
      ${plans.length ? '' : `<p class="muted" style="margin-top:16px">${t('Tip:')} <a href="#/plans/new">${t('create a plan')}</a> ${t('to start a full workout with one tap.')}</p>`}`;

    root.addEventListener('click', async (e) => {
      if (e.target.closest('[data-act="empty"]')) {
        Draft.save(newDraft(null));
        WO.refresh();
        return;
      }
      const planBtn = e.target.closest('[data-plan]');
      if (planBtn) {
        await startFromPlan(planBtn.dataset.plan);
        WO.refresh();
      }
    });
  }

  /* ---------- Workout in progress ---------- */
  async function renderDraft(root, draft) {
    const units = WO.units.label();
    const [sessions, sets] = await Promise.all([WO.db.getAll('sessions'), WO.db.getAll('sets')]);

    // "Previous" column: sets from the most recent other session with that exercise.
    const sessionDate = new Map(sessions.filter((s) => s.id !== draft.id).map((s) => [s.id, s.date]));
    const previous = {};
    const prevDate = {};
    sets.forEach((s) => {
      const d = sessionDate.get(s.session_id);
      if (!d) return;
      if (!prevDate[s.exercise_id] || d > prevDate[s.exercise_id]) { prevDate[s.exercise_id] = d; previous[s.exercise_id] = []; }
      if (d === prevDate[s.exercise_id]) previous[s.exercise_id].push(s);
    });
    Object.values(previous).forEach((list) => list.sort((a, b) => a.set_no - b.set_no));

    const save = () => Draft.save(draft);
    const title = draft.plan_name || t(draft.editing ? 'Workout' : 'Empty workout');

    root.innerHTML = `
      <header class="page-head">
        <div>
          <p class="eyebrow">${t(draft.editing ? 'Editing a saved session' : 'Workout in progress')}</p>
          <h1 tabindex="-1">${esc(title)}</h1>
          <div class="log-meta">
            ${draft.editing
              ? `<span class="badge">${icon('calendar')} ${WO.fmt.date(draft.date)}</span>`
              : `<span class="badge badge-accent">${icon('clock')} <span class="elapsed" id="elapsed">0:00</span></span>`}
            <span class="badge" id="ex-count"></span>
          </div>
        </div>
        ${WO.settings.get().restSeconds > 0 ? `<div class="page-actions">
          <button type="button" class="btn btn-secondary" data-act="timer">${icon('timer')} ${t('Rest timer')}</button>
        </div>` : ''}
      </header>
      <div class="log-blocks" id="blocks"></div>
      <button type="button" class="btn btn-secondary btn-block btn-lg" data-act="add-exercise" style="margin-top:14px">${icon('plus')} ${t('Add exercise')}</button>

      <section class="card" style="margin-top:14px">
        <h2 style="margin-bottom:14px">${t('Session details')}</h2>
        <div class="field-row">
          <div class="field">
            <label for="log-date">${t('Date and time')}</label>
            <input id="log-date" type="datetime-local" class="input" value="${WO.dates.toInput(draft.date)}">
          </div>
          <div class="field">
            <label for="log-duration">${t('Duration (minutes)')}</label>
            <input id="log-duration" type="number" inputmode="numeric" min="1" max="1440" step="1" class="input"
                   value="${draft.duration != null ? esc(draft.duration) : ''}" placeholder="${draft.editing ? '' : t('Worked out automatically')}">
          </div>
        </div>
        <div class="field" style="margin-bottom:0">
          <label for="log-notes">${t('Notes')} <span class="muted">${t('(optional)')}</span></label>
          <textarea id="log-notes" class="input" rows="2" maxlength="500" placeholder="${t('How did it feel? Anything to remember next time?')}">${esc(draft.notes)}</textarea>
        </div>
      </section>

      <div class="log-actions">
        <div>
          <div class="progress-text" id="progress-text"></div>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-ghost" data-act="discard">${t(draft.editing ? 'Cancel' : 'Discard')}</button>
          <button type="button" class="btn btn-primary" data-act="finish">${icon('check')} ${t(draft.editing ? 'Save changes' : 'Finish workout')}</button>
        </div>
      </div>`;

    const blocksEl = root.querySelector('#blocks');

    // Scroll picker (<select>) for one value of one set.
    function pickerCell(set, field, block, i) {
      const isWeight = field === 'weight';
      const label = isWeight ? t('weight in {units}', { units }) : t('reps');
      const choices = isWeight ? WEIGHT_CHOICES[units] : REP_CHOICES;
      const picker = `<select class="input" data-field="${field}"
        aria-label="${t('{name} set {n} {field}', { name: esc(block.exercise_name), n: i + 1, field: label })}">
        ${ui.options(choices, isWeight ? WO.units.toDisplay(set.weight) : set.reps)}</select>`;
      if (!isWeight) return `<td>${picker}</td>`;
      return `<td><div class="w-step">
        <button type="button" data-act="w-step" data-step="${-WEIGHT_STEP_KG}" aria-label="${t('{kg} kg lighter', { kg: WEIGHT_STEP_KG })}">−</button>
        ${picker}
        <button type="button" data-act="w-step" data-step="${WEIGHT_STEP_KG}" aria-label="${t('{kg} kg heavier', { kg: WEIGHT_STEP_KG })}">+</button>
      </div></td>`;
    }

    // A weight picked in the picker carries down to the later unticked sets; the −/+ buttons change only their own row.
    function setWeight(block, si, kg, carryDown) {
      block.sets.slice(si, carryDown ? undefined : si + 1).forEach((s, k) => { if (k === 0 || !s.done) s.weight = kg; });
      save();
      drawBlocks();
    }

    // Empty values start as last time's (same set number, else the last set), then the plan target, then 12 reps at 0 kg.
    function fillFromLastTime(block) {
      const prev = previous[block.exercise_id] || [];
      block.sets.forEach((s, i) => {
        const p = prev[i] || prev[prev.length - 1];
        if (s.weight == null) s.weight = p ? p.weight || 0 : 0;
        if (s.reps == null) s.reps = p ? p.reps : (block.target && block.target.reps) || DEFAULT_REPS;
      });
    }

    function blockHtml(block, bi) {
      const prev = previous[block.exercise_id] || [];
      const tg = block.target;
      const name = esc(block.exercise_name);
      const cols = `<th class="col-prev left">${t('Previous')}</th><th>${units}</th><th>${t('Reps')}</th>`;
      const rows = block.sets.map((s, i) => {
        const prevText = prev[i] ? WO.stats.setLabel(prev[i]) : '–';
        const cells = pickerCell(s, 'weight', block, i) + pickerCell(s, 'reps', block, i);
        return `
          <tr data-set="${i}" class="${s.done ? 'done' : ''}">
            <td class="set-no">${i + 1}</td>
            <td class="set-prev left">${esc(prevText)}</td>
            ${cells}
            <td><button type="button" class="check-btn" data-act="done" aria-pressed="${s.done}" aria-label="${t('Mark set {n} of {name} done', { n: i + 1, name })}">${icon('check')}</button></td>
            <td><button type="button" class="btn-icon danger" data-act="remove-set" aria-label="${t('Remove set {n}', { n: i + 1 })}" ${block.sets.length === 1 ? 'disabled' : ''}>${icon('x')}</button></td>
          </tr>`;
      }).join('');
      const targetText = tg ? t('Target {sets} × {n} reps', { sets: tg.sets, n: tg.reps }) : '';
      const lastText = prevDate[block.exercise_id] ? t('Last time {when}', { when: WO.fmt.relative(prevDate[block.exercise_id]).toLowerCase() }) : t('First time logging this');
      return `
        <section class="card block" data-block="${bi}">
          <div class="block-head">
            <div class="grow">
              <h2><span class="type-dot type-weights" aria-hidden="true"></span>${name}</h2>
              <p class="meta">${[targetText, lastText].filter(Boolean).join(' · ')}</p>
            </div>
            <div class="block-tools">
              <button type="button" class="btn-icon" data-act="block-up" ${bi === 0 ? 'disabled' : ''} aria-label="${t('Move {name} up', { name })}">${icon('up')}</button>
              <button type="button" class="btn-icon" data-act="block-down" ${bi === draft.blocks.length - 1 ? 'disabled' : ''} aria-label="${t('Move {name} down', { name })}">${icon('down')}</button>
              <button type="button" class="btn-icon danger" data-act="remove-block" aria-label="${t('Remove {name}', { name })}">${icon('trash')}</button>
            </div>
          </div>
          <table class="sets">
            <thead><tr><th>${t('Set')}</th>${cols}<th><span class="sr-only">${t('Done')}</span>${icon('check')}</th><th><span class="sr-only">${t('Remove')}</span></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="block-foot">
            <button type="button" class="btn btn-ghost btn-sm" data-act="add-set">${icon('plus')} ${t('Add set')}</button>
          </div>
        </section>`;
    }

    function drawBlocks() {
      draft.blocks.forEach(fillFromLastTime);
      save();
      blocksEl.innerHTML = draft.blocks.length
        ? draft.blocks.map(blockHtml).join('')
        : ui.empty({ icon: 'dumbbell', title: t('No exercises yet'), text: t('Add the first exercise of this workout.') });
      updateProgress();
    }

    function updateProgress() {
      const all = draft.blocks.flatMap((b) => b.sets);
      const done = all.filter((s) => s.done).length;
      root.querySelector('#ex-count').textContent = WO.fmt.plural(draft.blocks.length, 'exercise');
      root.querySelector('#progress-text').textContent = all.length ? t('{done} of {total} done', { done, total: WO.fmt.plural(all.length, 'set') }) : t('No sets yet');
    }

    // Elapsed clock for a live workout.
    let clock = null;
    if (!draft.editing) {
      const el = root.querySelector('#elapsed');
      const tick = () => { el.textContent = WO.fmt.clock((Date.now() - new Date(draft.startedAt).getTime()) / 1000); };
      tick();
      clock = setInterval(tick, 1000);
    }

    // Typing into a set or the session details.
    root.addEventListener('input', (e) => {
      const input = e.target;
      if (input.id === 'log-date') { const iso = WO.dates.fromInput(input.value); if (iso) { draft.date = iso; save(); } return; }
      if (input.id === 'log-duration') { draft.duration = input.value === '' ? null : Number(input.value); save(); return; }
      if (input.id === 'log-notes') { draft.notes = input.value; save(); return; }
      const field = input.dataset.field;
      if (!field) return;
      const bi = Number(input.closest('[data-block]').dataset.block);
      const si = Number(input.closest('[data-set]').dataset.set);
      if (field === 'weight') {
        setWeight(draft.blocks[bi], si, WO.units.fromInput(input.value), true);
        blocksEl.querySelector(`[data-block="${bi}"] [data-set="${si}"] [data-field="weight"]`).focus();
        return;
      }
      draft.blocks[bi].sets[si][field] = Number(input.value);
      save();
    });

    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const blockEl = btn.closest('[data-block]');
      const bi = blockEl ? Number(blockEl.dataset.block) : -1;
      const block = draft.blocks[bi];

      if (act === 'timer') { WO.timer.start(); return; }

      if (act === 'add-exercise') {
        const picked = await WO.pickExercises({ title: t('Add exercises'), already: draft.blocks.map((b) => b.exercise_id) });
        if (!picked.length) return;
        picked.forEach((ex) => draft.blocks.push(newBlock(ex)));
        save();
        drawBlocks();
        const last = blocksEl.querySelector(`[data-block="${draft.blocks.length - picked.length}"] select`);
        if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); last.focus({ preventScroll: true }); }
        return;
      }

      if (act === 'w-step') {
        const si = Number(btn.closest('[data-set]').dataset.set);
        const kg = Math.min(LIMITS.weight, Math.max(0, (block.sets[si].weight || 0) + Number(btn.dataset.step)));
        setWeight(block, si, Math.round(kg * 100) / 100, false);
        blocksEl.querySelector(`[data-block="${bi}"] [data-set="${si}"] [data-step="${btn.dataset.step}"]`).focus();
        return;
      }

      if (act === 'done') {
        const row = btn.closest('[data-set]');
        const set = block.sets[Number(row.dataset.set)];
        set.done = !set.done;
        if (set.done) {
          const isLast = bi === draft.blocks.length - 1 && Number(row.dataset.set) === block.sets.length - 1;
          if (WO.settings.get().autoRest && !isLast) WO.timer.start();
        }
        row.classList.toggle('done', set.done);
        btn.setAttribute('aria-pressed', String(set.done));
        save();
        updateProgress();
        return;
      }

      if (act === 'add-set') {
        block.sets.push(newSet(block.sets[block.sets.length - 1]));
        save();
        drawBlocks();
        const input = blocksEl.querySelector(`[data-block="${bi}"] tbody tr:last-child select`);
        if (input) input.focus();
        return;
      }
      if (act === 'remove-set') {
        block.sets.splice(Number(btn.closest('[data-set]').dataset.set), 1);
      } else if (act === 'remove-block') {
        const hasValues = block.sets.some((s) => s.done);
        if (hasValues && !(await ui.confirm({ title: t('Remove exercise?'), message: t('Remove {name} and its sets from this workout?', { name: `<strong>${esc(block.exercise_name)}</strong>` }), confirmLabel: t('Remove'), danger: true }))) return;
        draft.blocks.splice(bi, 1);
      } else if (act === 'block-up' && bi > 0) {
        [draft.blocks[bi - 1], draft.blocks[bi]] = [draft.blocks[bi], draft.blocks[bi - 1]];
      } else if (act === 'block-down' && bi < draft.blocks.length - 1) {
        [draft.blocks[bi + 1], draft.blocks[bi]] = [draft.blocks[bi], draft.blocks[bi + 1]];
      } else if (act === 'discard') {
        const ok = !Draft.hasProgress(draft) && !draft.editing ? true : await ui.confirm({
          title: t(draft.editing ? 'Cancel editing?' : 'Discard workout?'),
          message: t(draft.editing ? 'Your changes to this session will be lost. The saved session stays as it was.' : 'All sets in this workout will be lost.'),
          confirmLabel: t(draft.editing ? 'Cancel editing' : 'Discard'), danger: true,
        });
        if (!ok) return;
        const wasEditing = draft.editing;
        Draft.clear();
        WO.timer.stop();
        if (wasEditing) location.hash = '#/history'; else WO.refresh();
        return;
      } else if (act === 'finish') {
        finish();
        return;
      } else {
        return;
      }
      save();
      drawBlocks();
    });

    /* ---------- Validate and save ---------- */
    async function finish() {
      ui.clearErrors(root);
      const problems = [];
      let firstBad = null;
      const bad = (input, msg) => { ui.markInvalid(input, msg); firstBad = firstBad || input; problems.push(msg); };

      // Check every number against sensible limits.
      blocksEl.querySelectorAll('[data-block]').forEach((bEl) => {
        const block = draft.blocks[Number(bEl.dataset.block)];
        bEl.querySelectorAll('[data-set]').forEach((row) => {
          const set = block.sets[Number(row.dataset.set)];
          const get = (f) => row.querySelector(`[data-field="${f}"]`);
          const check = (f, max, integer, label) => {
            const v = set[f];
            if (v == null) return;
            if (Number.isNaN(v) || v < 0 || v > max || (integer && !Number.isInteger(v))) {
              const maxText = max === LIMITS.weight ? WO.units.toDisplay(max) + ' ' + units : max;
              bad(get(f), t(integer ? '{label} must be a whole number from 0 to {max}' : '{label} must be a number from 0 to {max}', { label: t(label), max: maxText }));
            }
          };
          check('weight', LIMITS.weight, false, 'Weight');
          check('reps', LIMITS.reps, true, 'Reps');
        });
      });

      const dateInput = root.querySelector('#log-date');
      const date = WO.dates.fromInput(dateInput.value);
      if (!date) { ui.setError(dateInput, t('Enter a valid date and time.')); firstBad = firstBad || dateInput; problems.push('date'); }
      else if (new Date(date).getTime() > Date.now() + 60 * 60 * 1000) { ui.setError(dateInput, t('The date can’t be in the future.')); firstBad = firstBad || dateInput; problems.push('date'); }

      const durInput = root.querySelector('#log-duration');
      if (durInput.value !== '' || (durInput.validity && durInput.validity.badInput)) {
        const d = Number(durInput.value);
        if (durInput.value === '' || !Number.isInteger(d) || d < 1 || d > 1440) {
          ui.setError(durInput, t('Duration must be a whole number of minutes from 1 to 1440.'));
          firstBad = firstBad || durInput;
          problems.push('duration');
        }
      }

      if (firstBad) {
        firstBad.focus();
        firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ui.toast(problems.length > 1 ? t('Fix {n} highlighted fields before saving', { n: problems.length }) : t('Fix the highlighted field before saving'), { type: 'error' });
        return;
      }

      // Build the records. Only ticked sets are saved (the pickers always hold a value).
      const sessionId = draft.id;
      const records = [];
      draft.blocks.forEach((block, order) => {
        let n = 0;
        block.sets.forEach((s) => {
          const rec = {
            id: WO.uid(), session_id: sessionId, exercise_id: block.exercise_id, exercise_name: block.exercise_name,
            order, set_no: 0, reps: s.reps || null, weight: s.weight || 0,
          };
          if (!s.done || !WO.stats.hasData(rec)) return;
          rec.set_no = ++n;
          records.push(rec);
        });
      });
      if (!records.length) {
        ui.toast(t(draft.blocks.length ? 'Tick at least one set before saving' : 'Add an exercise and log at least one set first'), { type: 'error' });
        const first = blocksEl.querySelector('[data-act="done"]');
        if (first) first.focus();
        return;
      }

      const elapsedMin = Math.max(1, Math.round((Date.now() - new Date(draft.startedAt).getTime()) / 60000));
      const now = new Date().toISOString();
      const session = {
        id: sessionId, date, plan_id: draft.plan_id, plan_name: draft.plan_name, notes: draft.notes.trim().slice(0, 500),
        duration: draft.duration != null ? draft.duration : (draft.editing ? null : Math.min(elapsedMin, 1440)),
        created_at: draft.created_at || now, updated_at: now,
      };
      if (draft.demo) session.demo = true;

      // Personal bests: compare with every other session.
      const others = sets.filter((s) => s.session_id !== sessionId && sessionDate.has(s.session_id));
      const before = WO.stats.bests(others, sessions.filter((s) => s.id !== sessionId));
      const prs = [];
      WO.stats.bests(records, [session]).forEach((b, exId) => {
        const old = before.get(exId);
        if (old && WO.stats.isBetter(b.set, old.set)) prs.push(b);
      });

      const ops = [{ type: 'put', store: 'sessions', value: session }];
      sets.filter((s) => s.session_id === sessionId).forEach((s) => ops.push({ type: 'delete', store: 'sets', id: s.id }));
      records.forEach((value) => ops.push({ type: 'put', store: 'sets', value }));
      try {
        await WO.db.batch(ops);
      } catch (err) {
        ui.toast(t('Could not save the workout: {error}', { error: err.message }), { type: 'error' });
        return;
      }
      const wasEditing = draft.editing;
      Draft.clear();
      WO.timer.stop();
      if (wasEditing) {
        ui.toast(t('Session updated'), { type: 'success' });
        location.hash = '#/history';
        return;
      }
      showSummary(session, records, prs);
    }

    function showSummary(session, records, prs) {
      const sum = WO.stats.sessionSummary(records);
      const dlg = ui.modal({
        title: t('Workout saved'),
        body: `
          <div class="summary-hero">
            <div class="big-icon">${icon(prs.length ? 'trophy' : 'check')}</div>
            <h3>${t(prs.length ? 'New personal best!' : 'Nice work!')}</h3>
            <p class="muted">${esc(session.plan_name || t('Workout'))} · ${WO.fmt.date(session.date)}</p>
          </div>
          <div class="detail-meta">
            <div><div class="k">${t('Duration')}</div><div class="v">${WO.fmt.duration(session.duration)}</div></div>
            <div><div class="k">${t('Sets')}</div><div class="v">${sum.setCount}</div></div>
            <div><div class="k">${t('Volume')}</div><div class="v">${WO.units.fmt(sum.volume)}</div></div>
          </div>
          ${prs.length ? `<div class="summary-prs">${prs.map((p) => `<div>${icon('trophy')} ${esc(p.name)}: ${esc(WO.stats.bestLabel(p.set))}</div>`).join('')}</div>` : ''}`,
        footer: `<button type="button" class="btn btn-secondary" data-go="#/history">${t('View history')}</button><button type="button" class="btn btn-primary" data-close autofocus>${t('Done')}</button>`,
        onClose: () => { if (location.hash.startsWith('#/log')) location.hash = goTo; },
      });
      let goTo = '#/';
      dlg.querySelector('[data-go]').addEventListener('click', (e) => { goTo = e.currentTarget.dataset.go; dlg.close(); });
    }

    drawBlocks();
    return () => clearInterval(clock);
  }

  async function render(root, mode, id) {
    if (mode === 'plan') { await startFromPlan(id); location.replace('#/log'); return; }
    if (mode === 'edit') { await startEdit(id); location.replace('#/log'); return; }
    const draft = Draft.get();
    if (!draft) return renderStart(root);
    return renderDraft(root, draft);
  }

  WO.views.log = { title: 'Log workout', nav: 'log', render };
})();
