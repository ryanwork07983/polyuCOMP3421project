/* ==========================================================================
   View: Dashboard (#/)
   Today at a glance: workout in progress, this week, quick start, recent
   sessions, and a reminder to back up.
   ========================================================================== */
(function () {
  'use strict';
  const WO = window.WO;
  const { esc, icon, ui, t } = WO;

  function greeting() {
    const h = new Date().getHours();
    return t(h < 5 ? 'Late night session?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
  }

  async function render(root) {
    const data = await WO.db.all();
    const sessions = data.sessions.sort((a, b) => b.date.localeCompare(a.date));
    const bySession = WO.stats.bySession(data.sets);
    const draft = WO.draft.get();
    const settings = WO.settings.get();
    const exMap = new Map(data.exercises.map((e) => [e.id, e]));

    // This week, Monday to Sunday.
    const monday = WO.dates.startOfWeek(new Date());
    const todayKey = WO.dates.isoDay(new Date());
    const trainedDays = new Set(sessions.map((s) => WO.dates.isoDay(s.date)));
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = WO.dates.addDays(monday, i);
      const key = WO.dates.isoDay(d);
      return { d, key, done: trainedDays.has(key), today: key === todayKey, future: key > todayKey };
    });
    const thisWeek = sessions.filter((s) => new Date(s.date) >= monday).length;
    const streak = WO.stats.weekStreak(sessions);

    // Plans: least recently used first, as a hint for what's next.
    const lastUsed = {};
    sessions.forEach((s) => { if (s.plan_id && !lastUsed[s.plan_id]) lastUsed[s.plan_id] = s.date; });
    const plans = data.plans.slice().sort((a, b) => (lastUsed[a.id] || '').localeCompare(lastUsed[b.id] || '') || WO.byName(a, b));
    const next = plans[0];
    // Quick start shows the plans the user pinned; until they pin any, the 3 least recently done.
    const pinned = settings.quickPlans ? settings.quickPlans.map((id) => data.plans.find((p) => p.id === id)).filter(Boolean) : plans.slice(0, 3);

    const daysSinceBackup = settings.lastExport ? Math.floor((Date.now() - new Date(settings.lastExport).getTime()) / WO.dates.DAY) : null;
    const needsBackup = sessions.length >= 3 && (daysSinceBackup == null || daysSinceBackup >= 14);

    const draftSets = draft ? draft.blocks.reduce((n, b) => n + b.sets.filter((s) => s.done).length, 0) : 0;

    // Personal bests for the exercises the user picked; until they pick any, the 3 they log most.
    const bests = WO.stats.bests(data.sets, sessions);
    const setCount = {};
    data.sets.forEach((s) => { setCount[s.exercise_id] = (setCount[s.exercise_id] || 0) + 1; });
    const prIds = (settings.prExercises || [...bests.keys()].sort((a, b) => setCount[b] - setCount[a]).slice(0, 3))
      .filter((id) => exMap.has(id) || bests.has(id));

    root.innerHTML = `
      <section class="hero">
        <p class="eyebrow">${WO.fmt.date(new Date())}</p>
        <h1 tabindex="-1">${greeting()}</h1>
        <p>${sessions.length
          ? (thisWeek ? t("You've trained {count} this week. Keep it going.", { count: WO.fmt.plural(thisWeek, 'time') }) : t('A new week. A good time for a workout.'))
          : t('Plan your workouts, log every set, and watch your progress. No account, no ads, and everything stays on this device.')}</p>
        <div class="hero-actions">
          ${draft
            ? `<a class="btn btn-primary btn-lg" href="#/log">${icon('play')} ${t('Resume workout')}</a>`
            : next
              ? `<a class="btn btn-primary btn-lg" href="#/log/plan/${encodeURIComponent(next.id)}">${icon('play')} ${t('Start {name}', { name: esc(next.name) })}</a>
                 <a class="btn btn-ghost btn-lg" href="#/log">${t('Other workout')}</a>`
              : `<a class="btn btn-primary btn-lg" href="#/log">${icon('play')} ${t('Start a workout')}</a>`}
        </div>
      </section>

      ${draft ? `
        <div class="banner" role="status">
          <span class="pulse" aria-hidden="true"></span>
          <div class="banner-text">
            <strong>${draft.editing ? t('You are editing a saved session') : t('{name} in progress', { name: esc(draft.plan_name || t('Workout')) })}</strong>
            <span class="muted small">${draft.editing ? t('Finish or cancel the edit when you are ready.') : t('Started {time} · {sets} done', { time: WO.fmt.time(draft.startedAt), sets: WO.fmt.plural(draftSets, 'set') })}</span>
          </div>
          <a class="btn btn-primary btn-sm" href="#/log">${t(draft.editing ? 'Continue editing' : 'Resume')} ${icon('right')}</a>
        </div>` : ''}

      ${needsBackup ? `
        <div class="banner banner-warn">
          ${icon('alert')}
          <div class="banner-text">
            <strong>${t('Back up your workouts')}</strong>
            <span class="muted small">${daysSinceBackup == null ? t('You have never exported a backup.') : t('Your last backup was {n} days ago.', { n: daysSinceBackup })} ${t('Your data only lives in this browser, so clearing site data deletes it.')}</span>
          </div>
          <a class="btn btn-secondary btn-sm" href="#/settings">${icon('download')} ${t('Back up')}</a>
        </div>` : ''}

      <div class="grid grid-2">
        <section class="card">
          <div class="card-head">
            <div><h2>${t('This week')}</h2><p class="muted small">${WO.fmt.plural(thisWeek, 'workout')}${streak ? ` · ${t('{weeks} streak', { weeks: WO.fmt.plural(streak, 'week') })}` : ''}</p></div>
            ${icon('flame')}
          </div>
          <div class="week-strip">
            ${week.map((w) => `
              <div class="week-day ${w.done ? 'done' : ''} ${w.today ? 'today' : ''} ${w.future ? 'future' : ''}">
                <span>${WO.fmt.weekday(w.d).slice(0, 2)}</span>
                <span class="dot" title="${t(w.done ? 'Trained' : 'Rest day')}">${w.done ? icon('check') : w.d.getDate()}</span>
              </div>`).join('')}
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div><h2>${t('Quick start')}</h2><p class="muted small">${t('Your plans')}</p></div>
            ${plans.length ? `<button type="button" class="btn btn-ghost btn-sm" data-act="pick-plans">${icon('pencil')} ${t('Choose plans')}</button>` : ''}
          </div>
          ${!plans.length ? `<p class="muted">${t('No plans yet.')} <a href="#/plans/new">${t('Create your first plan')}</a>.</p>`
            : !pinned.length ? `<p class="muted">${t('No plans pinned yet.')}</p>` : `<div class="quick-list">
            ${pinned.map((p) => `
              <a class="quick-item" href="#/log/plan/${encodeURIComponent(p.id)}">
                <span class="grow"><strong>${esc(p.name)}</strong>
                  <span class="muted small">${WO.fmt.plural(p.items.filter((i) => exMap.has(i.exercise_id)).length, 'exercise')} · ${lastUsed[p.id] ? t('done {when}', { when: WO.fmt.relative(lastUsed[p.id]).toLowerCase() }) : t('not done yet')}</span></span>
                <span class="arrow">${icon('play')}</span>
              </a>`).join('')}
          </div>`}
        </section>
      </div>

      ${sessions.length ? `
        <section class="card" style="margin-top:16px">
          <div class="card-head">
            <div><h2>${t('Personal bests')}</h2><p class="muted small">${t('Pick the exercises you want to follow')}</p></div>
            <button type="button" class="btn btn-ghost btn-sm" data-act="pick-pr">${icon('plus')} ${t('Choose exercises')}</button>
          </div>
          ${prIds.length ? `<ul class="pr-list">${prIds.map((id) => {
            const best = bests.get(id);
            const name = exMap.has(id) ? exMap.get(id).name : best.name;
            return `
              <li>
                ${icon('trophy')}
                <span class="grow"><strong>${esc(name)}</strong>
                  <span class="muted small">${best ? WO.fmt.relative(best.date) : t('Not logged yet')}</span></span>
                <span class="best">${best ? esc(WO.stats.bestLabel(best.set)) : '–'}</span>
                <button type="button" class="btn-icon" data-pr-remove="${esc(id)}" aria-label="${t('Remove {name}', { name: esc(name) })}">${icon('x')}</button>
              </li>`;
          }).join('')}</ul>` : `<p class="muted">${t('No exercises chosen yet.')}</p>`}
        </section>
        <div class="section-title"><h2>${t('Recent workouts')}</h2><a href="#/history">${t('See all')} ${icon('right')}</a></div>
        <div class="session-list">${sessions.slice(0, 3).map((s) => WO.sessionItem(s, bySession.get(s.id) || [])).join('')}</div>
      ` : `
        <section class="card" style="margin-top:16px">
          <h2>${t('Getting started')}</h2>
          <ol class="steps">
            <li><div><strong>${t('Check your exercises.')}</strong> <span class="muted">${t('A starter library is ready.')} <a href="#/exercises">${t('Add or edit exercises')}</a> ${t('to match your gym.')}</span></div></li>
            <li><div><strong>${t('Build a plan.')}</strong> <span class="muted">${t('Group exercises into a routine like “Push day”.')} <a href="#/plans">${t('Three sample plans')}</a> ${t('are included.')}</span></div></li>
            <li><div><strong>${t('Log a workout.')}</strong> <span class="muted">${t('Tick off each set as you go. The rest timer starts by itself.')}</span></div></li>
            <li><div><strong>${t('Watch your progress.')}</strong> <span class="muted">${t('History shows charts and personal bests. Back up from Settings any time.')}</span></div></li>
          </ol>
        </section>
      `}`;

    root.addEventListener('click', async (e) => {
      const item = e.target.closest('[data-session]');
      if (item) WO.showSession(item.dataset.session);
      const remove = e.target.closest('[data-pr-remove]');
      if (remove) {
        WO.settings.set({ prExercises: prIds.filter((id) => id !== remove.dataset.prRemove) });
        WO.refresh();
      }
      if (e.target.closest('[data-act="pick-plans"]')) pickPlans(pinned.map((p) => p.id));
      if (e.target.closest('[data-act="pick-pr"]')) {
        const picked = await WO.pickExercises({ title: t('Show personal bests for'), already: prIds });
        if (!picked.length) return;
        WO.settings.set({ prExercises: [...new Set(prIds.concat(picked.map((x) => x.id)))] });
        WO.refresh();
      }
    });
  }

  /** Tick the plans to pin on the dashboard's quick start; `shownIds` are the ones on screen now. */
  async function pickPlans(shownIds) {
    const plans = (await WO.db.getAll('plans')).sort(WO.byName);
    const current = new Set(shownIds);
    const dlg = ui.modal({
      title: t('Choose plans for quick start'),
      body: `<div class="picker-list" role="group" aria-label="${t('Plans')}">${plans.map((p) => `
        <label class="picker-item"><input type="checkbox" value="${esc(p.id)}" ${current.has(p.id) ? 'checked' : ''}>
          <span class="picker-name">${esc(p.name)}</span></label>`).join('')}</div>`,
      footer: `<button type="button" class="btn btn-secondary" data-close>${t('Cancel')}</button>
               <button type="submit" class="btn btn-primary">${t('Save')}</button>`,
    });
    dlg.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      WO.settings.set({ quickPlans: [...dlg.querySelectorAll('input:checked')].map((i) => i.value) });
      dlg.close();
      WO.refresh();
    });
  }

  WO.views.dashboard = { title: 'Home', nav: 'home', render };
})();
