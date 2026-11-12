/* ==========================================================================
   View: History and progress (CRUD flow 3: read and delete sessions)
   #/history            list of past sessions, with details, edit and delete
   #/history/progress   stats, weekly chart, progress per exercise, personal bests
   ========================================================================== */
(function () {
  'use strict';
  const WO = window.WO;
  const { esc, icon, ui, t } = WO;

  const filters = { q: '', plan: 'all', exercise: null };

  function tabs(active) {
    return `<nav class="segmented" aria-label="${t('History sections')}" style="margin-bottom:20px">
      <a href="#/history" ${active === 'sessions' ? 'aria-current="page"' : ''}>${icon('calendar')} ${t('Sessions')}</a>
      <a href="#/history/progress" ${active === 'progress' ? 'aria-current="page"' : ''}>${icon('chart')} ${t('Progress')}</a>
    </nav>`;
  }

  /* ---------- Session detail dialog ---------- */
  WO.showSession = async function (sessionId) {
    const data = await WO.db.all();
    const session = data.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const own = WO.stats.bySession(data.sets.filter((s) => s.session_id === sessionId)).get(sessionId) || [];
    const groups = WO.stats.exerciseGroups(own);
    const sum = WO.stats.sessionSummary(own);

    // Highlight sets that are this exercise's all-time best.
    const bests = WO.stats.bests(data.sets, data.sessions);

    const dlg = ui.modal({
      title: session.plan_name || t('Workout'),
      wide: true,
      body: `
        <p class="muted" style="margin-bottom:14px">${t('{date} at {time}', { date: WO.fmt.date(session.date), time: WO.fmt.time(session.date) })}</p>
        <div class="detail-meta">
          <div><div class="k">${t('Duration')}</div><div class="v">${WO.fmt.duration(session.duration)}</div></div>
          <div><div class="k">${t('Sets')}</div><div class="v">${sum.setCount}</div></div>
          <div><div class="k">${t('Volume')}</div><div class="v">${WO.units.fmt(sum.volume)}</div></div>
        </div>
        ${groups.map((g) => {
          const best = bests.get(g.exercise_id);
          return `
          <div class="detail-ex">
            <h3><span class="type-dot type-weights" aria-hidden="true"></span>${esc(g.name)}</h3>
            <div class="detail-sets">${g.sets.map((s) => {
              const isPr = best && best.set.id === s.id;
              return `<span class="${isPr ? 'pr' : ''}" ${isPr ? `title="${t('Personal best')}"` : ''}>${isPr ? icon('trophy') + ' ' : ''}${esc(WO.stats.setLabel(s))}</span>`;
            }).join('')}</div>
          </div>`;
        }).join('') || `<p class="muted">${t('No sets recorded.')}</p>`}
        ${session.notes ? `<h3 style="margin-top:6px">${t('Notes')}</h3><div class="detail-notes">${esc(session.notes)}</div>` : ''}`,
      footer: `
        <button type="button" class="btn btn-danger-soft" data-act="delete">${icon('trash')} ${t('Delete')}</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-secondary" data-act="edit">${icon('pencil')} ${t('Edit')}</button>
        <button type="button" class="btn btn-primary" data-close autofocus>${t('Close')}</button>`,
    });

    dlg.querySelector('[data-act="edit"]').addEventListener('click', () => {
      dlg.close();
      location.hash = `#/log/edit/${encodeURIComponent(session.id)}`;
    });
    dlg.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      dlg.close();
      const ok = await ui.confirm({
        title: t('Delete session?'),
        message: t('Delete {name} from {date} and its {sets}?', { name: `<strong>${esc(session.plan_name || t('Workout'))}</strong>`, date: WO.fmt.date(session.date), sets: WO.fmt.plural(own.length, 'set') }),
        confirmLabel: t('Delete'), danger: true,
      });
      if (!ok) return;
      await WO.db.batch([{ type: 'delete', store: 'sessions', id: session.id }].concat(own.map((s) => ({ type: 'delete', store: 'sets', id: s.id }))));
      WO.refresh();
      ui.toast(t('Session deleted'), {
        action: {
          label: t('Undo'),
          fn: async () => {
            await WO.db.batch([{ type: 'put', store: 'sessions', value: session }].concat(own.map((s) => ({ type: 'put', store: 'sets', value: s }))));
            WO.refresh();
          },
        },
      });
    });
  };

  WO.sessionItem = function (session, sessionSets) {
    const sum = WO.stats.sessionSummary(sessionSets);
    const d = new Date(session.date);
    return `
      <button type="button" class="session-item" data-session="${esc(session.id)}">
        <span class="date-tile" aria-hidden="true"><span class="d">${d.getDate()}</span><span class="w">${WO.fmt.weekday(session.date)}</span></span>
        <span class="grow">
          <span class="si-title">${esc(session.plan_name || t('Workout'))}</span>
          <span class="ex-names">${esc(sum.exercises.join(', ') || t('No sets'))}</span>
        </span>
        <span class="session-stats">
          <span><strong>${session.duration ? WO.fmt.duration(session.duration) : '–'}</strong>${t('time')}</span>
          <span><strong>${sum.setCount}</strong>${t('sets')}</span>
          <span><strong>${sum.volume ? WO.units.fmt(sum.volume) : '–'}</strong>${t('volume')}</span>
        </span>
      </button>`;
  };

  /* ---------- Sessions list ---------- */
  async function renderSessions(root) {
    const data = await WO.db.all();
    const bySession = WO.stats.bySession(data.sets);
    const sessions = data.sessions.sort((a, b) => b.date.localeCompare(a.date));
    const planNames = [...new Set(sessions.map((s) => s.plan_name || t('Workout')))].sort();

    // Sets done this week (since Monday) per muscle group; deleted exercises count as "Other".
    const weekStart = WO.dates.startOfWeek(new Date()).getTime();
    const thisWeek = new Set(sessions.filter((s) => new Date(s.date).getTime() >= weekStart).map((s) => s.id));
    const groupOf = new Map(data.exercises.map((e) => [e.id, e.muscle_group]));
    const perGroup = {};
    data.sets.filter((s) => thisWeek.has(s.session_id)).forEach((s) => {
      const g = groupOf.get(s.exercise_id) || 'Other';
      perGroup[g] = (perGroup[g] || 0) + 1;
    });
    const groups = WO.GROUPS.concat(Object.keys(perGroup).filter((g) => !WO.GROUPS.includes(g))).filter((g) => perGroup[g]);
    const weekSets = groups.reduce((n, g) => n + perGroup[g], 0);

    root.innerHTML = `
      <header class="page-head">
        <div>
          <h1 tabindex="-1">${t('History')}</h1>
          <p class="subtitle">${t('{count} logged', { count: WO.fmt.plural(sessions.length, 'workout') })}</p>
        </div>
        <div class="page-actions"><a class="btn btn-primary" href="#/log">${icon('plus')} ${t('Log workout')}</a></div>
      </header>
      ${tabs('sessions')}
      ${sessions.length ? `
        <section class="card" style="margin-bottom:16px">
          <div class="card-head"><div><h2>${t('Sets per muscle group this week')}</h2>
            <p class="muted small">${t('{count} since Monday', { count: WO.fmt.plural(weekSets, 'set') })}</p></div></div>
          ${groups.length ? '<div id="muscle-chart"></div>' : `<p class="muted">${t('No sets logged this week yet.')}</p>`}
        </section>
        <div class="toolbar">
          <label class="search">${icon('search')}
            <input type="search" class="input" placeholder="${t('Search exercises or notes')}" aria-label="${t('Search sessions')}" value="${esc(filters.q)}">
          </label>
          <select class="input" style="width:auto;min-width:180px" aria-label="${t('Filter by plan')}" id="plan-filter">
            <option value="all">${t('All plans')}</option>
            ${planNames.map((n) => `<option ${filters.plan === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}
          </select>
        </div>` : ''}
      <div id="session-results"></div>`;

    const results = root.querySelector('#session-results');

    function draw() {
      if (!sessions.length) {
        results.innerHTML = ui.empty({
          icon: 'calendar', title: t('No workouts yet'),
          text: t('Workouts you log show up here, with details you can edit later. Want to see how it looks? Load demo history in Settings.'),
          action: `<a class="btn btn-primary" href="#/log">${icon('play')} ${t('Log your first workout')}</a>`,
        });
        return;
      }
      const q = filters.q.trim().toLowerCase();
      const shown = sessions.filter((s) => {
        if (filters.plan !== 'all' && (s.plan_name || t('Workout')) !== filters.plan) return false;
        if (!q) return true;
        const sets = bySession.get(s.id) || [];
        return (s.plan_name || '').toLowerCase().includes(q) || (s.notes || '').toLowerCase().includes(q) ||
          sets.some((x) => x.exercise_name.toLowerCase().includes(q));
      });
      if (!shown.length) {
        results.innerHTML = ui.empty({ icon: 'search', title: t('No matching workouts'), text: t('Try another search or plan.') });
        return;
      }
      const months = [];
      shown.forEach((s) => {
        const key = s.date.slice(0, 7);
        let m = months[months.length - 1];
        if (!m || m.key !== key) { m = { key, label: WO.fmt.month(s.date), items: [] }; months.push(m); }
        m.items.push(s);
      });
      results.innerHTML = months.map((m) => `
        <div class="month-head"><h2>${esc(m.label)}</h2><span>${WO.fmt.plural(m.items.length, 'workout')}</span></div>
        <div class="session-list">${m.items.map((s) => WO.sessionItem(s, bySession.get(s.id) || [])).join('')}</div>`).join('');
    }

    if (groups.length) {
      WO.charts.bars(root.querySelector('#muscle-chart'), groups.map((g) => ({
        label: t(g), value: perGroup[g], tip: `${t(g)}: ${WO.fmt.plural(perGroup[g], 'set')}`,
      })), { integer: true, minMax: 5, label: t('Sets per muscle group this week') });
    }

    root.addEventListener('input', (e) => { if (e.target.type === 'search') { filters.q = e.target.value; draw(); } });
    root.addEventListener('change', (e) => { if (e.target.id === 'plan-filter') { filters.plan = e.target.value; draw(); } });
    root.addEventListener('click', (e) => {
      const item = e.target.closest('[data-session]');
      if (item) WO.showSession(item.dataset.session);
    });
    draw();
  }

  /* ---------- Progress ---------- */
  async function renderProgress(root) {
    const data = await WO.db.all();
    const sessions = data.sessions.sort((a, b) => a.date.localeCompare(b.date));
    const sessionMap = new Map(sessions.map((s) => [s.id, s]));
    const sets = data.sets.filter((s) => sessionMap.has(s.session_id));
    const weekStart = WO.dates.startOfWeek(new Date()).getTime();
    const thisWeek = sessions.filter((s) => new Date(s.date).getTime() >= weekStart).length;
    const totalVolume = WO.stats.volume(sets);
    const totalMinutes = sessions.reduce((m, s) => m + (s.duration || 0), 0);
    const streak = WO.stats.weekStreak(sessions);

    // Exercises with logged sets, most-logged first.
    const counts = {};
    const info = {};
    sets.forEach((s) => {
      counts[s.exercise_id] = (counts[s.exercise_id] || 0) + 1;
      info[s.exercise_id] = { name: s.exercise_name };
    });
    const logged = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    if (!filters.exercise || !info[filters.exercise]) filters.exercise = logged[0] || null;

    const bests = [...WO.stats.bests(sets, sessions).values()].sort((a, b) => a.name.localeCompare(b.name));

    root.innerHTML = `
      <header class="page-head">
        <div>
          <h1 tabindex="-1">${t('Progress')}</h1>
          <p class="subtitle">${t('How your training is trending')}</p>
        </div>
      </header>
      ${tabs('progress')}
      ${!sessions.length ? ui.empty({
        icon: 'chart', title: t('Nothing to chart yet'),
        text: t('Log a few workouts and your charts and personal bests appear here. You can also load demo history from Settings to try it out.'),
        action: `<a class="btn btn-primary" href="#/log">${icon('play')} ${t('Log a workout')}</a>`,
      }) : `
      <div class="grid grid-4">
        <div class="card stat"><span class="stat-label">${icon('calendar')} ${t('Workouts')}</span><span class="stat-value">${sessions.length}</span><span class="stat-sub">${t('all time')}</span></div>
        <div class="card stat"><span class="stat-label">${icon('flame')} ${t('This week')}</span><span class="stat-value">${thisWeek}</span><span class="stat-sub">${t('since Monday')}</span></div>
        <div class="card stat"><span class="stat-label">${icon('repeat')} ${t('Week streak')}</span><span class="stat-value">${streak}<small>${t(streak === 1 ? 'week' : 'weeks')}</small></span><span class="stat-sub">${t('in a row with a workout')}</span></div>
        <div class="card stat"><span class="stat-label">${icon('weight')} ${t('Total volume')}</span><span class="stat-value">${WO.fmt.int(WO.units.toDisplay(totalVolume) || 0)}<small>${WO.units.label()}</small></span><span class="stat-sub">${t('{n} h trained', { n: WO.fmt.int(totalMinutes / 60) })}</span></div>
      </div>

      <section class="card" style="margin-top:16px">
        <div class="card-head"><div><h2>${t('Workouts per week')}</h2><p class="muted small">${t('Last 12 weeks')}</p></div></div>
        <div id="weekly-chart"></div>
      </section>

      <section class="card" style="margin-top:16px">
        <div class="card-head">
          <div><h2>${t('Exercise progress')}</h2><p class="muted small" id="metric-name"></p></div>
          <div class="chart-controls">
            <label class="sr-only" for="ex-select">${t('Exercise')}</label>
            <select id="ex-select" class="input">
              ${logged.map((id) => `<option value="${esc(id)}" ${id === filters.exercise ? 'selected' : ''}>${esc(info[id].name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="ex-chart"></div>
        <div class="chart-summary" id="ex-summary"></div>
      </section>

      <section class="card" style="margin-top:16px">
        <div class="card-head"><div><h2>${t('Personal bests')}</h2><p class="muted small">${t('Heaviest weight for every exercise')}</p></div>${icon('trophy')}</div>
        <div style="overflow-x:auto">
          <table class="pr-table">
            <thead><tr><th>${t('Exercise')}</th><th>${t('Best')}</th><th class="hide-sm">${t('Date')}</th></tr></thead>
            <tbody>${bests.map((b) => `
              <tr>
                <td><span class="ex"><span class="type-dot type-weights" aria-hidden="true"></span>${esc(b.name)}</span></td>
                <td class="num">${esc(WO.stats.bestLabel(b.set))}</td>
                <td class="hide-sm muted">${WO.fmt.shortYear(b.date)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`}`;

    if (!sessions.length) return;

    const weeks = WO.stats.weekly(sessions, 12);
    WO.charts.bars(root.querySelector('#weekly-chart'), weeks.map((w, i) => ({
      label: WO.fmt.short(w.start),
      value: w.count,
      highlight: i === weeks.length - 1,
      tip: t('Week of {date}: {count}', { date: WO.fmt.short(w.start), count: WO.fmt.plural(w.count, 'workout') }),
    })), { integer: true, minMax: 3, label: t('Workouts per week for the last 12 weeks') });

    function drawExercise() {
      const id = filters.exercise;
      const { name } = info[id];
      const exSets = sets.filter((s) => s.exercise_id === id);
      // Done without extra weight (e.g. pull-ups at 0 kg): chart the reps instead of a flat 0 kg line.
      const byReps = !exSets.some((s) => s.weight > 0);
      const perSession = WO.stats.bySession(exSets);
      const points = [];
      sessions.forEach((s) => {
        const list = perSession.get(s.id);
        if (!list) return;
        const v = WO.stats.metric(list, byReps);
        const y = byReps ? v : WO.units.toDisplay(v);
        points.push({ label: WO.fmt.short(s.date), y, tip: `${WO.fmt.short(s.date)}: ${WO.stats.metricFmt(byReps, v)}` });
      });
      root.querySelector('#metric-name').textContent = t('{metric} per session', { metric: WO.stats.metricName(byReps) }) + (byReps ? '' : ` (${WO.units.label()})`);
      WO.charts.line(root.querySelector('#ex-chart'), points, { label: t('{name} progress', { name }), empty: t('No sets logged for this exercise yet') });

      const first = points[0];
      const last = points[points.length - 1];
      const best = points.reduce((m, p) => (p.y > m ? p.y : m), -Infinity);
      const unit = byReps ? t('reps') : WO.units.label();
      const change = last && first ? last.y - first.y : 0;
      root.querySelector('#ex-summary').innerHTML = `
        <div class="stat"><span class="stat-label">${t('Sessions')}</span><span class="stat-value" style="font-size:1.3rem">${points.length}</span></div>
        <div class="stat"><span class="stat-label">${t('Best')}</span><span class="stat-value" style="font-size:1.3rem">${WO.fmt.num(best)}<small>${unit}</small></span></div>
        <div class="stat"><span class="stat-label">${t('Latest')}</span><span class="stat-value" style="font-size:1.3rem">${last ? WO.fmt.num(last.y) : '–'}<small>${unit}</small></span></div>
        <div class="stat"><span class="stat-label">${t('Change since first')}</span><span class="stat-value" style="font-size:1.3rem;color:${change > 0 ? 'var(--success)' : change < 0 ? 'var(--danger)' : 'inherit'}">${change > 0 ? '+' : ''}${WO.fmt.num(change)}<small>${unit}</small></span></div>`;
    }

    if (filters.exercise) drawExercise();
    root.querySelector('#ex-select').addEventListener('change', (e) => { filters.exercise = e.target.value; drawExercise(); });
  }

  WO.views.history = {
    title: 'History',
    nav: 'history',
    render(root, tab) { return tab === 'progress' ? renderProgress(root) : renderSessions(root); },
  };
})();
