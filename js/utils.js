/* ==========================================================================
   Shared helpers: escaping, ids, settings, formatting, units, icons and
   small UI pieces (modal, confirm, toast, form errors).
   Everything hangs off one global object, window.WO.
   ========================================================================== */
(function () {
  'use strict';
  const WO = (window.WO = window.WO || {});

  /* ---------- Basics ---------- */

  // Escape text before putting it into an HTML string. Every user value goes through this.
  WO.esc = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  };

  WO.uid = function () {
    try {
      if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch (e) { /* randomUUID is missing on some origins */ }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  };

  WO.clone = (obj) => JSON.parse(JSON.stringify(obj));
  WO.byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

  /* ---------- localStorage, safely ----------
     Storage can be blocked (private windows, strict privacy settings).
     If it is, values live in memory for this visit only. */
  const memory = {};
  let localWorks = true;
  try {
    localStorage.setItem('the-workout:probe', '1');
    localStorage.removeItem('the-workout:probe');
  } catch (e) { localWorks = false; }

  WO.local = {
    works: localWorks,
    get(key) {
      if (key in memory) return memory[key];
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); delete memory[key]; return true; }
      catch (e) { memory[key] = value; return false; }
    },
    remove(key) {
      delete memory[key];
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    },
    getJSON(key, fallback) {
      try { const raw = this.get(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
    },
    setJSON(key, value) { return this.set(key, JSON.stringify(value)); },
  };

  /* ---------- Settings (small, so they live in localStorage) ---------- */
  const SETTINGS_KEY = 'the-workout:settings';
  const DEFAULT_SETTINGS = {
    units: 'kg', theme: 'system', restSeconds: 90, sound: true, autoRest: true, seeded: false, lastExport: null,
  };
  let settingsCache = null;
  WO.settings = {
    get() {
      if (!settingsCache) settingsCache = Object.assign({}, DEFAULT_SETTINGS, WO.local.getJSON(SETTINGS_KEY, {}));
      return Object.assign({}, settingsCache);
    },
    set(patch) {
      settingsCache = Object.assign({}, this.get(), patch);
      WO.local.setJSON(SETTINGS_KEY, settingsCache);
      return this.get();
    },
  };

  WO.applyTheme = function () {
    const theme = WO.settings.get().theme;
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
  };

  /* ---------- Dates ---------- */
  const DAY = 86400000;
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function startOfWeek(d) { // weeks start on Monday
    const x = startOfDay(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  const pad = (n) => String(n).padStart(2, '0');
  WO.dates = {
    DAY, startOfWeek, addDays,
    // ISO string -> value for <input type="datetime-local">
    toInput(iso) {
      const d = new Date(iso);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
    fromInput(value) {
      if (!value) return null;
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d.toISOString();
    },
    isoDay(d) { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; },
  };

  /* ---------- Formatting (in the chosen language, see i18n.js) ---------- */
  const t = WO.t;
  const loc = WO.i18n.locale;
  const fDate = new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const fShort = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' });
  const fShortYear = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' });
  const fTime = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' });
  const fMonth = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' });
  const fWeekday = new Intl.DateTimeFormat(loc, { weekday: 'short' });
  const fNum = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  const fInt = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });

  WO.fmt = {
    date: (iso) => fDate.format(new Date(iso)),
    short: (iso) => fShort.format(new Date(iso)),
    shortYear: (iso) => fShortYear.format(new Date(iso)),
    time: (iso) => fTime.format(new Date(iso)),
    month: (iso) => fMonth.format(new Date(iso)),
    weekday: (iso) => fWeekday.format(new Date(iso)),
    num: (n) => fNum.format(n),
    int: (n) => fInt.format(n),
    duration(min) {
      if (min == null || isNaN(min)) return '–';
      const h = Math.floor(min / 60), m = Math.round(min % 60);
      return h ? t('{h} h {m} min', { h, m }) : t('{n} min', { n: m });
    },
    clock(sec) {
      sec = Math.max(0, Math.floor(sec));
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
      return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    },
    relative(iso) {
      const days = Math.round((startOfDay(new Date()) - startOfDay(iso)) / DAY);
      if (days === 0) return t('Today');
      if (days === 1) return t('Yesterday');
      if (days > 1 && days < 7) return t('{n} days ago', { n: days });
      if (days >= 7 && days < 28) { const w = Math.floor(days / 7); return w === 1 ? t('Last week') : t('{n} weeks ago', { n: w }); }
      return new Date(iso).getFullYear() === new Date().getFullYear() ? WO.fmt.short(iso) : WO.fmt.shortYear(iso);
    },
    // English adds an "s"; other languages look up "{n} word" in their dictionary (e.g. "{n} set" -> "{n} 組").
    plural: (n, word) => (WO.i18n.lang === 'en' ? `${n} ${n === 1 ? word : word + 's'}` : t('{n} ' + word, { n })),
  };

  /* ---------- Units: weights are always stored in kg ---------- */
  const KG_PER_LB = 0.45359237;
  WO.units = {
    label: () => WO.settings.get().units,
    toDisplay(kg) {
      if (kg == null || kg === '' || isNaN(kg)) return null;
      const v = WO.units.label() === 'lb' ? kg / KG_PER_LB : kg;
      return Math.round(v * 10) / 10;
    },
    // Returns null for an empty field and NaN for something that is not a number.
    fromInput(value) {
      if (value === '' || value == null) return null;
      const n = Number(value);
      if (!isFinite(n)) return NaN;
      return WO.units.label() === 'lb' ? n * KG_PER_LB : n;
    },
    fmt(kg) {
      const v = WO.units.toDisplay(kg);
      return v == null ? '–' : `${WO.fmt.num(v)} ${WO.units.label()}`;
    },
  };

  /* ---------- Icons (inline SVG, drawn on a 24px grid) ---------- */
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9v11.5h13V9"/><path d="M10 20.5v-6h4v6"/>',
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM9 11h6M9 15h4"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    chart: '<path d="M4 4v16h16"/><path d="M8 15l3.5-4 3 2.5L20 7"/>',
    settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
    flame: '<path d="M12 21c-4 0-7-2.7-7-6.5 0-3 2-5 3.5-6.5.3 2 1.4 3 2.5 3 0-3 1-6 4-8 0 3 1.5 4.5 3 6.5 1 1.3 1 2.8 1 4 0 4.5-3 7.5-7 7.5z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 20.5h7M10 17h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    weight: '<path d="M6 8h12l2 12H4z"/><circle cx="12" cy="5.5" r="2.5"/>',
    repeat: '<path d="M17 2.5l3 3-3 3"/><path d="M4 11.5v-1a5 5 0 0 1 5-5h11M7 21.5l-3-3 3-3"/><path d="M20 12.5v1a5 5 0 0 1-5 5H4"/>',
  };
  WO.icon = function (name, cls) {
    return `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  };

  /* ---------- UI: modal, confirm, toast, form errors ---------- */
  const esc = WO.esc;
  const ui = (WO.ui = {});

  /**
   * Open a modal <dialog>. `body` and `footer` are HTML strings (escape user data first).
   * Buttons with [data-close] close it. Returns the dialog element.
   */
  ui.modal = function ({ title, body, footer, wide, onClose }) {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal' + (wide ? ' modal-wide' : '');
    const titleId = WO.uid();
    dlg.setAttribute('aria-labelledby', titleId);
    dlg.innerHTML = `
      <form class="modal-inner" novalidate>
        <header class="modal-head">
          <h2 id="${titleId}">${esc(title)}</h2>
          <button type="button" class="btn-icon" data-close aria-label="${t('Close')}">${WO.icon('x')}</button>
        </header>
        <div class="modal-body">${body || ''}</div>
        ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
      </form>`;
    document.body.appendChild(dlg);
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    // Click on the dimmed backdrop closes the dialog.
    dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => {
      dlg.remove();
      if (onClose) onClose();
    });
    dlg.showModal();
    const auto = dlg.querySelector('[autofocus]');
    if (auto) auto.focus();
    return dlg;
  };

  /** Ask a yes/no question. Resolves true when the user confirms. */
  ui.confirm = function ({ title, message, confirmLabel = t('Confirm'), danger = false }) {
    return new Promise((resolve) => {
      let ok = false;
      const dlg = ui.modal({
        title,
        body: `<p>${message}</p>`,
        footer: `<button type="button" class="btn btn-secondary" data-close autofocus>${t('Cancel')}</button>
                 <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(confirmLabel)}</button>`,
        onClose: () => resolve(ok),
      });
      dlg.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); ok = true; dlg.close(); });
    });
  };

  /** Show a short message. Optional action button, e.g. { label: 'Undo', fn }. */
  ui.toast = function (message, { type = 'info', action } = {}) {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const iconName = type === 'success' ? 'check' : type === 'error' ? 'alert' : type === 'pr' ? 'trophy' : 'info';
    el.innerHTML = `${WO.icon(iconName)}<span class="msg">${esc(message)}</span>${action ? `<button type="button" class="toast-action">${esc(action.label)}</button>` : ''}`;
    box.appendChild(el);
    let timer;
    const dismiss = () => {
      clearTimeout(timer);
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 200);
    };
    if (action) {
      el.querySelector('.toast-action').addEventListener('click', () => { dismiss(); action.fn(); });
    }
    timer = setTimeout(dismiss, action ? 6000 : 3500);
  };

  /** Mark a form control invalid and show a message under it. */
  ui.setError = function (input, message) {
    const field = input.closest('.field') || input.parentElement;
    let err = field.querySelector(':scope > .field-error');
    if (!err) {
      err = document.createElement('p');
      err.className = 'field-error';
      err.id = 'err-' + WO.uid();
      field.appendChild(err);
    }
    err.textContent = message;
    input.classList.add('invalid');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', err.id);
  };

  /** Mark a control invalid without adding a message element (used in tight table cells). */
  ui.markInvalid = function (input, message) {
    input.classList.add('invalid');
    input.setAttribute('aria-invalid', 'true');
    input.title = message;
  };

  ui.clearErrors = function (root) {
    root.querySelectorAll('.invalid').forEach((i) => {
      i.classList.remove('invalid');
      i.removeAttribute('aria-invalid');
      i.removeAttribute('aria-describedby');
      i.removeAttribute('title');
    });
    root.querySelectorAll('.field-error, .form-error').forEach((e) => e.remove());
  };

  /** Numbers from `from` to `to`, e.g. range(1, 20) or range(0, 100, 0.5). */
  ui.range = (from, to, step = 1) =>
    Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => Math.round((from + i * step) * 100) / 100);

  /**
   * <option>s for a scroll picker (a <select>, which phones show as a wheel).
   * A `current` value that is not in the list is added, so saved data is never changed by opening the form.
   */
  ui.options = function (values, current) {
    const list = current != null && !values.includes(current) ? values.concat(current).sort((a, b) => a - b) : values;
    return list.map((v) => `<option value="${v}"${v === current ? ' selected' : ''}>${WO.fmt.num(v)}</option>`).join('');
  };

  ui.empty = function ({ icon = 'sparkle', title, text, action }) {
    return `<div class="empty">
      <div class="empty-icon">${WO.icon(icon)}</div>
      <h3>${esc(title)}</h3>
      ${text ? `<p>${text}</p>` : ''}
      ${action || ''}
    </div>`;
  };

  /** Save a text file to the user's computer. */
  ui.download = function (filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Muscle groups are stored in English (so backups match across languages) and translated with t() when shown.
  WO.GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Full body', 'Other'];
  WO.views = WO.views || {};
})();
