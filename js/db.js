/* ==========================================================================
   Storage layer.
   Uses IndexedDB when the browser allows it, and falls back to localStorage
   (or, as a last resort, memory for this visit only).
   Every engine exposes the same two calls: getAll(store) and batch(ops).
   A batch is a list of { type: 'put' | 'delete' | 'clear', store, value | id }
   that is applied all-or-nothing.
   ========================================================================== */
(function () {
  'use strict';
  const WO = window.WO;

  const DB_NAME = 'the-workout';
  const DB_VERSION = 1;
  const STORES = ['exercises', 'plans', 'sessions', 'sets'];
  const LS_PREFIX = 'the-workout:store:';

  let engine = null;
  let idb = null;

  function openIndexedDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB is not available')); return; }
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (err) { reject(err); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: 'id' });
            if (name === 'sets') store.createIndex('session_id', 'session_id');
          }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open IndexedDB'));
      req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
      setTimeout(() => reject(new Error('IndexedDB did not respond')), 5000);
    });
  }

  const indexedDBEngine = {
    name: 'IndexedDB',
    getAll(store) {
      return new Promise((resolve, reject) => {
        const req = idb.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },
    batch(ops) {
      const names = Array.from(new Set(ops.map((o) => o.store)));
      if (!names.length) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction(names, 'readwrite');
        ops.forEach((op) => {
          const store = tx.objectStore(op.store);
          if (op.type === 'put') store.put(op.value);
          else if (op.type === 'delete') store.delete(op.id);
          else if (op.type === 'clear') store.clear();
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Saving was cancelled'));
      });
    },
  };

  // Each store is one JSON array under its own localStorage key.
  function makeKeyValueEngine(name, persistent) {
    return {
      name,
      read(store) { return WO.local.getJSON(LS_PREFIX + store, []); },
      getAll(store) { return Promise.resolve(this.read(store)); },
      batch(ops) {
        const maps = {};
        const load = (s) => maps[s] || (maps[s] = new Map(this.read(s).map((r) => [r.id, r])));
        ops.forEach((op) => {
          const m = load(op.store);
          if (op.type === 'put') m.set(op.value.id, WO.clone(op.value));
          else if (op.type === 'delete') m.delete(op.id);
          else if (op.type === 'clear') m.clear();
        });
        // Serialise everything first so a failure leaves storage untouched.
        const out = Object.keys(maps).map((s) => [LS_PREFIX + s, JSON.stringify(Array.from(maps[s].values()))]);
        const before = out.map(([key]) => [key, WO.local.get(key)]);
        for (const [key, json] of out) {
          if (!WO.local.set(key, json) && persistent) {
            before.forEach(([k, old]) => (old == null ? WO.local.remove(k) : WO.local.set(k, old)));
            return Promise.reject(new Error('Browser storage is full or blocked'));
          }
        }
        return Promise.resolve();
      },
    };
  }

  WO.db = {
    stores: STORES,

    async init() {
      try {
        idb = await openIndexedDB();
        engine = indexedDBEngine;
      } catch (err) {
        console.info('[The Workout] IndexedDB unavailable, falling back:', err && err.message);
        engine = WO.local.works
          ? makeKeyValueEngine('localStorage', true)
          : makeKeyValueEngine('Memory only', false);
      }
    },

    get engine() { return engine ? engine.name : null; },

    getAll(store) { return engine.getAll(store); },
    async get(store, id) { return (await engine.getAll(store)).find((r) => r.id === id) || null; },
    put(store, value) { return engine.batch([{ type: 'put', store, value }]); },
    remove(store, id) { return engine.batch([{ type: 'delete', store, id }]); },
    batch(ops) { return engine.batch(ops); },

    /** Everything at once: { exercises, plans, sessions, sets }. */
    async all() {
      const lists = await Promise.all(STORES.map((s) => engine.getAll(s)));
      const out = {};
      STORES.forEach((s, i) => { out[s] = lists[i]; });
      return out;
    },
  };
})();
