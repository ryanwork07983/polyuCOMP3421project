/* ==========================================================================
   Numbers about workouts: set labels, volume, personal bests, streaks.
   Pure functions over plain records, so every view computes things the same way.
   ========================================================================== */
(function () {
  'use strict';
  const WO = window.WO;

  const hasData = (set) => set.reps > 0;

  const stats = (WO.stats = {
    hasData,

    /** Group sets by session id, each list sorted in logging order. */
    bySession(sets) {
      const map = new Map();
      sets.forEach((s) => {
        if (!map.has(s.session_id)) map.set(s.session_id, []);
        map.get(s.session_id).push(s);
      });
      map.forEach((list) => list.sort((a, b) => (a.order - b.order) || (a.set_no - b.set_no)));
      return map;
    },

    /** Split one session's sets into exercise groups, in logging order. */
    exerciseGroups(sessionSets) {
      const groups = [];
      const byKey = new Map();
      sessionSets.forEach((s) => {
        const key = s.order + ':' + s.exercise_id;
        if (!byKey.has(key)) {
          const g = { exercise_id: s.exercise_id, name: s.exercise_name, sets: [] };
          byKey.set(key, g);
          groups.push(g);
        }
        byKey.get(key).sets.push(s);
      });
      return groups;
    },

    /** "60 kg × 8", or "8 reps" for a set done without extra weight. */
    setLabel(set) {
      return set.weight > 0 ? `${WO.units.fmt(set.weight)} × ${set.reps}` : WO.t('{n} reps', { n: set.reps });
    },

    /** A personal best is shown as its weight ("60 kg"); exercises done without weight show their reps. */
    bestLabel(set) {
      return set.weight > 0 ? WO.units.fmt(set.weight) : WO.t('{n} reps', { n: set.reps });
    },

    /** Total weight moved (weight × reps) in kg. */
    volume(sets) {
      return sets.reduce((sum, s) => sum + (s.weight && s.reps ? s.weight * s.reps : 0), 0);
    },

    /** Summary used by lists and cards. */
    sessionSummary(sessionSets) {
      const groups = stats.exerciseGroups(sessionSets);
      return {
        exercises: groups.map((g) => g.name),
        setCount: sessionSets.length,
        volume: stats.volume(sessionSets),
      };
    },

    /** The headline number for an exercise in one session: heaviest weight, or most reps when it is done without weight. */
    metric(sets, byReps) {
      if (!sets.length) return null;
      return Math.max(...sets.map((s) => (byReps ? s.reps : s.weight) || 0));
    },
    metricName(byReps) {
      return WO.t(byReps ? 'Most reps in a set' : 'Heaviest set');
    },
    metricFmt(byReps, value) {
      if (value == null) return '–';
      return byReps ? WO.t('{n} reps', { n: value }) : WO.units.fmt(value);
    },

    /** Best set per exercise: heaviest weight, ties broken by reps. */
    bests(sets, sessions) {
      const dateOf = new Map(sessions.map((s) => [s.id, s.date]));
      const best = new Map();
      sets.forEach((s) => {
        if (!hasData(s) || !dateOf.has(s.session_id)) return;
        const cur = best.get(s.exercise_id);
        if (!cur || stats.isBetter(s, cur.set)) {
          best.set(s.exercise_id, { exercise_id: s.exercise_id, name: s.exercise_name, set: s, date: dateOf.get(s.session_id) });
        }
      });
      return best;
    },

    isBetter(a, b) {
      if ((a.weight || 0) !== (b.weight || 0)) return (a.weight || 0) > (b.weight || 0);
      return (a.reps || 0) > (b.reps || 0);
    },

    /** Consecutive weeks (Mon–Sun) with at least one workout, counting back from this week. */
    weekStreak(sessions) {
      const weeks = new Set(sessions.map((s) => WO.dates.startOfWeek(s.date).getTime()));
      let week = WO.dates.startOfWeek(new Date());
      if (!weeks.has(week.getTime())) week = WO.dates.addDays(week, -7); // this week isn't over yet
      let streak = 0;
      while (weeks.has(WO.dates.startOfWeek(week).getTime())) {
        streak++;
        week = WO.dates.addDays(week, -7);
      }
      return streak;
    },

    /** Workouts per week for the last n weeks, oldest first. */
    weekly(sessions, n = 12) {
      const start = WO.dates.startOfWeek(new Date());
      const out = [];
      for (let i = n - 1; i >= 0; i--) {
        const from = WO.dates.addDays(start, -7 * i);
        out.push({ start: from, count: 0 });
      }
      const index = new Map(out.map((w, i) => [WO.dates.startOfWeek(w.start).getTime(), i]));
      sessions.forEach((s) => {
        const i = index.get(WO.dates.startOfWeek(s.date).getTime());
        if (i != null) out[i].count++;
      });
      return out;
    },
  });
})();
