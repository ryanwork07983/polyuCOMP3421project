/* ==========================================================================
   App start-up and hash router.
   Routes look like #/plans/new. Each view renders into a fresh container,
   so its event listeners disappear with it when you navigate away.
   ========================================================================== */
(function () {
  'use strict';
  const WO = window.WO;

  const ROUTES = [
    [/^\/?$/, 'dashboard'],
    [/^\/exercises$/, 'exercises'],
    [/^\/plans$/, 'plans'],
    [/^\/plans\/([^/]+)$/, 'plans'],
    [/^\/log$/, 'log'],
    [/^\/log\/(plan|edit)\/([^/]+)$/, 'log'],
    [/^\/history$/, 'history'],
    [/^\/history\/(progress)$/, 'history'],
    [/^\/settings$/, 'settings'],
  ];

  const main = document.getElementById('main');
  let cleanup = null;
  let renderId = 0;

  function match(path) {
    for (const [re, name] of ROUTES) {
      const m = path.match(re);
      if (m) return { name, params: m.slice(1).map(decodeURIComponent) };
    }
    return null;
  }

  async function route({ keepScroll } = {}) {
    const path = (location.hash || '#/').slice(1).split('?')[0];
    const found = match(path);
    if (!found) { location.replace('#/'); return; }
    const view = WO.views[found.name];
    const id = ++renderId;

    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { /* ignore */ } }
    cleanup = null;

    const container = document.createElement('div');
    container.className = 'view';
    const scrollY = window.scrollY;
    try {
      const result = await view.render(container, ...found.params);
      if (id !== renderId) return; // a newer navigation started meanwhile
      if (typeof result === 'function') cleanup = result;
    } catch (err) {
      console.error(err);
      container.innerHTML = WO.ui.empty({
        icon: 'alert', title: WO.t('Something went wrong'),
        text: WO.esc(err && err.message ? err.message : String(err)),
        action: `<a class="btn btn-primary" href="#/">${WO.t('Go home')}</a>`,
      });
    }
    if (id !== renderId || !container.hasChildNodes()) return;
    main.replaceChildren(container);

    document.title = `${WO.t(view.title)} · The Workout`;
    document.querySelectorAll('[data-nav]').forEach((a) => {
      if (a.dataset.nav === view.nav) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (keepScroll) {
      window.scrollTo(0, scrollY);
    } else {
      window.scrollTo(0, 0);
      // Move focus to the page heading so screen readers announce the new page.
      const h1 = container.querySelector('h1');
      if (h1 && WO.navigated) h1.focus({ preventScroll: true });
    }
    WO.navigated = true;
  }

  /** Re-render the current page in place (after data changes). */
  WO.refresh = () => route({ keepScroll: true });

  function renderNavIcons() {
    document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = WO.icon(el.dataset.icon); });
  }

  async function start() {
    WO.applyTheme();
    document.documentElement.lang = WO.i18n.lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = WO.t(el.textContent.trim()); });
    renderNavIcons();
    WO.timer.init();
    try {
      await WO.db.init();
      await WO.seed.ensure();
    } catch (err) {
      console.error(err);
      main.innerHTML = `<div class="view">${WO.ui.empty({ icon: 'alert', title: WO.t('Storage is not available'), text: WO.t('The Workout could not open browser storage. Try another browser or leave private mode.') })}</div>`;
      return;
    }
    window.addEventListener('hashchange', () => route());
    // Follow the device theme live when "System" is selected (the CSS handles colours; this keeps charts in sync).
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => { if (WO.settings.get().theme === 'system') WO.refresh(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
    }
    // Another tab changed the data or the settings: refresh to stay in sync.
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.startsWith('the-workout:') && !document.querySelector('dialog[open]')) {
        if (e.key === 'the-workout:settings') { location.reload(); return; }
        WO.refresh();
      }
    });
    await route();

    // Offline support when served over http(s). Opening the file directly skips this.
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode is optional */ });
    }
  }

  start();
})();
