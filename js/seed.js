/* ==========================================================================
   Starter data (loaded on the first visit) and optional demo history.
   Starter records use fixed ids so they can be restored without duplicates.
   ========================================================================== */
(function () {
  'use strict';
  const WO = window.WO;

  // [id, name, muscle group, notes]. Every exercise is logged as weight × reps (0 kg when done without extra weight).
  const EXERCISES = [
    ['bench-press', 'Bench press', 'Chest', 'Shoulder blades pinned back, bar touches mid-chest.'],
    ['incline-db-press', 'Incline dumbbell press', 'Chest', ''],
    ['push-up', 'Push-up', 'Chest', 'Body in one straight line.'],
    ['overhead-press', 'Overhead press', 'Shoulders', 'Squeeze glutes to protect the lower back.'],
    ['lateral-raise', 'Lateral raise', 'Shoulders', ''],
    ['tricep-pushdown', 'Triceps pushdown', 'Arms', ''],
    ['bicep-curl', 'Biceps curl', 'Arms', ''],
    ['deadlift', 'Deadlift', 'Back', 'Brace before every rep, bar close to the shins.'],
    ['pull-up', 'Pull-up', 'Back', ''],
    ['barbell-row', 'Barbell row', 'Back', ''],
    ['lat-pulldown', 'Lat pulldown', 'Back', ''],
    ['back-squat', 'Back squat', 'Legs', 'Hips below knees if mobility allows.'],
    ['romanian-deadlift', 'Romanian deadlift', 'Legs', ''],
    ['leg-press', 'Leg press', 'Legs', ''],
    ['lunge', 'Walking lunge', 'Legs', ''],
    ['calf-raise', 'Calf raise', 'Legs', ''],
    ['hanging-leg-raise', 'Hanging leg raise', 'Core', ''],
    ['crunch', 'Crunch', 'Core', ''],
  ];

  // items: [exercise id, sets, reps]
  const PLANS = [
    { id: 'push', name: 'Push day', description: 'Chest, shoulders and triceps.',
      items: [['bench-press', 4, 8], ['overhead-press', 3, 8], ['incline-db-press', 3, 10], ['lateral-raise', 3, 12], ['tricep-pushdown', 3, 12]] },
    { id: 'pull', name: 'Pull day', description: 'Back and biceps.',
      items: [['deadlift', 3, 5], ['pull-up', 3, 8], ['barbell-row', 3, 8], ['lat-pulldown', 3, 10], ['bicep-curl', 3, 12]] },
    { id: 'legs', name: 'Leg day', description: 'Squat focus with core work to finish.',
      items: [['back-squat', 4, 6], ['romanian-deadlift', 3, 8], ['leg-press', 3, 10], ['calf-raise', 3, 15], ['hanging-leg-raise', 3, 10]] },
  ];

  const exId = (id) => 'ex-' + id;

  // Names and notes are created in the current language; after that they are the user's own data.
  function starterExercises() {
    const now = new Date().toISOString();
    return EXERCISES.map(([id, name, group, notes]) => ({
      id: exId(id), name: WO.t(name), muscle_group: group, notes: notes && WO.t(notes), created_at: now, updated_at: now,
    }));
  }

  function starterPlans() {
    const now = new Date().toISOString();
    return PLANS.map((p) => ({
      id: 'plan-' + p.id, name: WO.t(p.name), description: WO.t(p.description), created_at: now, updated_at: now,
      items: p.items.map(([id, sets, reps]) => ({ exercise_id: exId(id), target_sets: sets, target_reps: reps })),
    }));
  }

  // Small deterministic random generator so demo data looks the same every time.
  function rng(seed) {
    let s = seed;
    return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  }

  // Starting weights (kg) and weekly increase for the demo history.
  const DEMO_LOADS = {
    'bench-press': [50, 1.25], 'overhead-press': [30, 0.6], 'incline-db-press': [16, 0.5], 'lateral-raise': [6, 0.25],
    'tricep-pushdown': [20, 0.6], deadlift: [80, 2.5], 'barbell-row': [45, 1.25], 'lat-pulldown': [40, 1],
    'bicep-curl': [10, 0.3], 'back-squat': [60, 2.5], 'romanian-deadlift': [50, 1.25], 'leg-press': [100, 3],
    'calf-raise': [40, 1],
  };
  const roundTo = (v, step) => Math.round(v / step) * step;

  function buildDemo(savedExercises, savedPlans) {
    const rand = rng(42);
    const sessions = [];
    const sets = [];
    // Use the names already saved (renamed, or created in another language); the demo workouts stay the starter ones.
    const nameOf = new Map(savedExercises.concat(savedPlans).map((r) => [r.id, r.name]));
    const plans = starterPlans().map((p) => Object.assign(p, { name: nameOf.get(p.id) || p.name }));
    const exercises = new Map(starterExercises().map((e) => [e.id, Object.assign(e, { name: nameOf.get(e.id) || e.name })]));
    const thisWeek = WO.dates.startOfWeek(new Date());
    const now = Date.now();
    const WEEKS = 8;

    for (let w = WEEKS - 1; w >= 0; w--) {
      const weekStart = WO.dates.addDays(thisWeek, -7 * w);
      const progress = WEEKS - 1 - w; // 0 for the oldest week
      // Monday push, Wednesday pull, Friday legs
      const days = [[0, plans[0]], [2, plans[1]], [4, plans[2]]];
      days.forEach(([offset, plan], di) => {
        const date = WO.dates.addDays(weekStart, offset);
        date.setHours(18, 30, 0, 0);
        if (date.getTime() > now) return;
        if (rand() < 0.12 && w !== 0) return; // a few missed days, like real life
        const sessionId = `demo-${w}-${di}`;
        plan.items.forEach((item, order) => {
          const key = item.exercise_id.slice(3);
          const ex = exercises.get(item.exercise_id);
          const [base, inc] = DEMO_LOADS[key] || [0, 0]; // moves done without extra weight (pull-up, leg raise) use 0 kg
          for (let n = 1; n <= item.target_sets; n++) {
            sets.push({
              id: `${sessionId}-${order}-${n}`, session_id: sessionId, exercise_id: ex.id, exercise_name: ex.name,
              order, set_no: n,
              weight: roundTo(base + inc * progress, key.includes('raise') || key.includes('curl') || key.includes('db') ? 1 : 2.5),
              reps: Math.max(1, item.target_reps - (n === item.target_sets && rand() < 0.4 ? 1 : 0)),
            });
          }
        });
        sessions.push({
          id: sessionId, date: date.toISOString(), plan_id: plan.id, plan_name: plan.name,
          notes: '', duration: Math.round(48 + rand() * 18), demo: true,
          created_at: date.toISOString(), updated_at: date.toISOString(),
        });
      });
    }
    return { sessions, sets };
  }

  WO.seed = {
    /** First visit: add the starter library and plans. */
    async ensure() {
      if (WO.settings.get().seeded) return;
      const existing = await WO.db.getAll('exercises');
      if (!existing.length) await WO.seed.loadStarter();
      WO.settings.set({ seeded: true });
    },

    /** Add any starter exercises/plans that are missing. Returns how many were added. */
    async loadStarter() {
      const [exercises, plans] = await Promise.all([WO.db.getAll('exercises'), WO.db.getAll('plans')]);
      const haveEx = new Set(exercises.map((e) => e.id));
      const haveNames = new Set(exercises.map((e) => e.name.toLowerCase()));
      const havePlans = new Set(plans.map((p) => p.id));
      const newEx = starterExercises().filter((e) => !haveEx.has(e.id) && !haveNames.has(e.name.toLowerCase()));
      const allExIds = new Set([...haveEx, ...newEx.map((e) => e.id)]);
      const newPlans = starterPlans()
        .filter((p) => !havePlans.has(p.id))
        .map((p) => ({ ...p, items: p.items.filter((i) => allExIds.has(i.exercise_id)) }))
        .filter((p) => p.items.length);
      await WO.db.batch([
        ...newEx.map((value) => ({ type: 'put', store: 'exercises', value })),
        ...newPlans.map((value) => ({ type: 'put', store: 'plans', value })),
      ]);
      return newEx.length + newPlans.length;
    },

    /** Eight weeks of sample sessions, handy for a demo. Also makes sure the starter data exists. */
    async loadDemo() {
      const exercises = await WO.db.getAll('exercises');
      const missing = starterExercises().filter((e) => !exercises.some((x) => x.id === e.id));
      const plans = await WO.db.getAll('plans');
      const missingPlans = starterPlans().filter((p) => !plans.some((x) => x.id === p.id));
      const { sessions, sets } = buildDemo(exercises, plans);
      await WO.db.batch([
        ...missing.map((value) => ({ type: 'put', store: 'exercises', value })),
        ...missingPlans.map((value) => ({ type: 'put', store: 'plans', value })),
        ...sessions.map((value) => ({ type: 'put', store: 'sessions', value })),
        ...sets.map((value) => ({ type: 'put', store: 'sets', value })),
      ]);
      return sessions.length;
    },

    async removeDemo() {
      const [sessions, sets] = await Promise.all([WO.db.getAll('sessions'), WO.db.getAll('sets')]);
      const demoIds = new Set(sessions.filter((s) => s.demo).map((s) => s.id));
      await WO.db.batch([
        ...[...demoIds].map((id) => ({ type: 'delete', store: 'sessions', id })),
        ...sets.filter((s) => demoIds.has(s.session_id)).map((s) => ({ type: 'delete', store: 'sets', id: s.id })),
      ]);
      return demoIds.size;
    },
  };
})();
