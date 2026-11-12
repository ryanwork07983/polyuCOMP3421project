/* ==========================================================================
   Small SVG charts (no library needed, works offline).
   Charts are drawn at the container's real width and redrawn on resize,
   so text stays crisp on phones and desktops.
   ========================================================================== */
(function () {
  'use strict';
  const WO = window.WO;
  const esc = WO.esc;

  function niceStep(range, count, integer) {
    const raw = range / count;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    let step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    if (integer) step = Math.max(1, Math.round(step));
    return step;
  }

  function scale(values, { fromZero, integer }) {
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (fromZero) lo = 0;
    if (hi === lo) {
      const pad = hi ? Math.abs(hi) * 0.2 : 1;
      hi += pad;
      lo = fromZero ? 0 : Math.max(0, lo - pad);
    }
    const step = niceStep(hi - lo, 4, integer);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    if (hi === lo) hi = lo + step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
    return { lo, hi, ticks };
  }

  // Redraw when the container changes width. Stops watching once it leaves the page.
  function watch(container, draw) {
    if (!window.ResizeObserver) return;
    let lastWidth = container.clientWidth;
    const ro = new ResizeObserver(() => {
      if (!container.isConnected) { ro.disconnect(); return; }
      if (Math.abs(container.clientWidth - lastWidth) > 4) { lastWidth = container.clientWidth; draw(); }
    });
    ro.observe(container);
  }

  // Shared tooltip for points and bars (mouse and keyboard focus).
  function wireTips(container) {
    let tip = null;
    const show = (target) => {
      const text = target.getAttribute('data-tip');
      if (!text) return;
      if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; container.appendChild(tip); }
      tip.textContent = text;
      const box = container.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(r.left + r.width / 2 - box.left, 60), box.width - 60)}px`;
      tip.style.top = `${r.top - box.top}px`;
      tip.hidden = false;
    };
    const hide = () => { if (tip) tip.hidden = true; };
    container.addEventListener('pointerover', (e) => { const t = e.target.closest('[data-tip]'); if (t) show(t); });
    container.addEventListener('pointerout', (e) => { if (e.target.closest('[data-tip]')) hide(); });
    container.addEventListener('focusin', (e) => { const t = e.target.closest('[data-tip]'); if (t) show(t); });
    container.addEventListener('focusout', hide);
  }

  /**
   * Line chart.
   * points: [{ label: 'date text', y: number, tip: 'tooltip text' }] in order.
   */
  function line(container, points, opts) {
    container.classList.add('chart');
    const draw = () => {
      if (!points.length) { container.innerHTML = `<div class="chart-empty">${esc(opts.empty)}</div>`; return; }
      const W = Math.max(260, container.clientWidth || 600);
      const H = 240;
      const m = { t: 18, r: 18, b: 30, l: 48 };
      const { lo, hi, ticks } = scale(points.map((p) => p.y), opts);
      const iw = W - m.l - m.r;
      const ih = H - m.t - m.b;
      const px = (i) => (points.length === 1 ? m.l + iw / 2 : m.l + (i / (points.length - 1)) * iw);
      const py = (v) => m.t + (1 - (v - lo) / (hi - lo)) * ih;
      const gid = 'g' + WO.uid().replace(/[^a-z0-9]/gi, '');

      const grid = ticks.map((t) => `<line class="chart-grid" x1="${m.l}" x2="${W - m.r}" y1="${py(t)}" y2="${py(t)}"/>
        <text class="chart-axis" x="${m.l - 8}" y="${py(t) + 4}" text-anchor="end">${esc(WO.fmt.num(t))}</text>`).join('');

      // Up to 5 evenly spaced x labels.
      const maxLabels = Math.max(2, Math.min(5, Math.floor(iw / 80)));
      const labelIdx = new Set();
      if (points.length <= maxLabels) points.forEach((_, i) => labelIdx.add(i));
      else for (let k = 0; k < maxLabels; k++) labelIdx.add(Math.round((k * (points.length - 1)) / (maxLabels - 1)));
      const xLabels = [...labelIdx].map((i) => {
        const anchor = points.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
        return `<text class="chart-axis" x="${px(i)}" y="${H - 8}" text-anchor="${anchor}">${esc(points[i].label)}</text>`;
      }).join('');

      const path = points.map((p, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
      const area = points.length > 1 ? `${path} L${px(points.length - 1).toFixed(1)},${m.t + ih} L${px(0).toFixed(1)},${m.t + ih} Z` : '';
      const dots = points.map((p, i) => `<circle class="chart-dot" cx="${px(i)}" cy="${py(p.y)}" r="${points.length > 30 ? 3 : 4.5}" tabindex="0" data-tip="${esc(p.tip)}" aria-label="${esc(p.tip)}"/>`).join('');

      container.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label)}">
        <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style="stop-color:var(--accent);stop-opacity:.28"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/>
        </linearGradient></defs>
        ${grid}
        ${area ? `<path d="${area}" fill="url(#${gid})"/>` : ''}
        <path class="chart-line" d="${path}"/>
        ${dots}
        ${xLabels}
      </svg>`;
    };
    draw();
    watch(container, draw);
    wireTips(container);
  }

  /**
   * Bar chart.
   * bars: [{ label, value, tip, highlight }]
   */
  function bars(container, data, opts) {
    container.classList.add('chart');
    const draw = () => {
      const W = Math.max(260, container.clientWidth || 600);
      const H = 220;
      const m = { t: 20, r: 8, b: 30, l: 32 };
      const values = data.map((d) => d.value);
      const { hi, ticks } = scale(values.concat([opts.minMax || 1]), { fromZero: true, integer: opts.integer });
      const iw = W - m.l - m.r;
      const ih = H - m.t - m.b;
      const slot = iw / data.length;
      const bw = Math.min(42, slot * 0.62);
      const py = (v) => m.t + (1 - v / hi) * ih;
      const every = Math.ceil(data.length / Math.max(2, Math.floor(iw / 56)));

      const grid = ticks.map((t) => `<line class="chart-grid" x1="${m.l}" x2="${W - m.r}" y1="${py(t)}" y2="${py(t)}"/>
        <text class="chart-axis" x="${m.l - 8}" y="${py(t) + 4}" text-anchor="end">${esc(WO.fmt.num(t))}</text>`).join('');
      const rects = data.map((d, i) => {
        const x = m.l + slot * i + (slot - bw) / 2;
        const h = Math.max(d.value ? 3 : 0, ih - (py(d.value) - m.t));
        const y = m.t + ih - h;
        // Count back from the newest bar so it always has a label and never sits right next to another one.
        const label = (data.length - 1 - i) % every === 0
          ? `<text class="chart-axis" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>` : '';
        const value = d.value ? `<text class="chart-value" x="${x + bw / 2}" y="${y - 5}" text-anchor="middle">${esc(WO.fmt.num(d.value))}</text>` : '';
        return `<rect class="chart-bar${d.highlight ? ' hl' : ''}" x="${x}" y="${y}" width="${bw}" height="${h}" rx="5" tabindex="0" data-tip="${esc(d.tip)}" aria-label="${esc(d.tip)}"/>${value}${label}`;
      }).join('');

      container.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label)}">
        ${grid}${rects}
        <line class="chart-grid" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}" style="stroke:var(--border-strong)"/>
      </svg>`;
    };
    draw();
    watch(container, draw);
    wireTips(container);
  }

  WO.charts = { line, bars };
})();
