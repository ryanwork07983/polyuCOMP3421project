/* ==========================================================================
   Rest timer: a floating countdown that survives page changes inside the app.
   It counts down to an end time, so it stays accurate even if the tab sleeps.
   ========================================================================== */
(function () {
  'use strict';
  const WO = window.WO;
  const R = 20;
  const CIRC = 2 * Math.PI * R;

  let el = null;
  let endAt = 0;
  let total = 0;
  let tick = null;
  let hideTimer = null;
  let audio = null;

  function beep() {
    if (!WO.settings.get().sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.22, 0.44].forEach((t, i) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.frequency.value = i === 2 ? 1175 : 880;
        osc.connect(gain);
        gain.connect(audio.destination);
        const start = audio.currentTime + t;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
        osc.start(start);
        osc.stop(start + 0.2);
      });
    } catch (e) { /* sound is optional */ }
  }

  function render(finished) {
    const left = Math.max(0, (endAt - Date.now()) / 1000);
    const offset = finished ? 0 : CIRC * (1 - left / total);
    el.classList.toggle('finished', !!finished);
    el.innerHTML = `
      <div class="rest-ring" aria-hidden="true">
        <svg viewBox="0 0 48 48"><circle class="bg" cx="24" cy="24" r="${R}"/><circle class="fg" cx="24" cy="24" r="${R}" stroke-dasharray="${CIRC}" stroke-dashoffset="${offset}"/></svg>
        ${WO.icon(finished ? 'check' : 'timer')}
      </div>
      <div class="rest-text" role="timer" aria-live="off">
        <span class="label">${WO.t(finished ? 'Rest over' : 'Rest')}</span>
        <span class="time">${finished ? WO.t('Go!') : WO.fmt.clock(Math.ceil(left))}</span>
      </div>
      ${finished ? '' : `<button type="button" data-t="-15" aria-label="${WO.t('Remove 15 seconds')}">−15</button>
      <button type="button" data-t="15" aria-label="${WO.t('Add 15 seconds')}">+15</button>`}
      <button type="button" data-t="stop" aria-label="${WO.t(finished ? 'Close timer' : 'Skip rest')}">${WO.icon('x')}</button>`;
  }

  function update() {
    if (Date.now() >= endAt) {
      clearInterval(tick);
      tick = null;
      render(true);
      beep();
      if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch (e) { /* ignore */ } }
      hideTimer = setTimeout(stop, 5000);
      return;
    }
    // Update only the moving parts to keep it cheap.
    const left = (endAt - Date.now()) / 1000;
    const time = el.querySelector('.time');
    const fg = el.querySelector('.fg');
    if (time) time.textContent = WO.fmt.clock(Math.ceil(left));
    if (fg) fg.setAttribute('stroke-dashoffset', String(CIRC * (1 - left / total)));
  }

  function start() {
    const seconds = WO.settings.get().restSeconds;
    if (!(seconds > 0)) return; // a rest time of 0 means the timer is off
    clearTimeout(hideTimer);
    clearInterval(tick);
    total = seconds;
    endAt = Date.now() + seconds * 1000;
    el.hidden = false;
    render(false);
    tick = setInterval(update, 250);
  }

  function adjust(delta) {
    endAt += delta * 1000;
    total = Math.max(total + delta, 5);
    if (endAt <= Date.now()) endAt = Date.now() + 1000;
    update();
  }

  function stop() {
    clearInterval(tick);
    clearTimeout(hideTimer);
    tick = null;
    if (el) el.hidden = true;
  }

  WO.timer = {
    init() {
      el = document.getElementById('rest-timer');
      el.setAttribute('aria-label', WO.t('Rest timer'));
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-t]');
        if (!btn) return;
        const t = btn.getAttribute('data-t');
        if (t === 'stop') stop(); else adjust(Number(t));
      });
    },
    start,
    stop,
  };
})();
