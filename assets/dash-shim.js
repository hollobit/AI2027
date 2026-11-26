/*
 * Minimal standalone stand-in for the claude.ai Data dashboard runtime (`dash`),
 * so the same page code runs on GitHub Pages. Datasets load from data/<id>.json.
 */
(function () {
  'use strict';
  const DATA_DIR = 'data/';
  const store = Object.create(null);   // id -> {status, data, message}
  const calcs = Object.create(null);   // id -> {inputs, fn}
  const calcCache = Object.create(null);
  const draws = [];                    // {name, fn}
  const listeners = [];
  let started = false;
  let rafPending = false;

  function load(id) {
    if (store[id] || calcs[id]) return;
    store[id] = { status: 'loading', data: [] };
    fetch(DATA_DIR + encodeURIComponent(id) + '.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((rows) => {
        const data = Array.isArray(rows) ? rows : (rows && rows.rows) || rows;
        store[id] = { status: 'ok', data, columns: Array.isArray(data) && data[0] ? Object.keys(data[0]) : [] };
      })
      .catch((err) => {
        console.error('[dash-shim] failed to load', id, err);
        store[id] = { status: 'error', data: [], message: String(err) };
      })
      .then(() => { Object.keys(calcCache).forEach((k) => delete calcCache[k]); schedule(); });
  }

  function calcResult(id) {
    if (calcCache[id]) return calcCache[id];
    const c = calcs[id];
    const inputs = c.inputs.map((i) => dash.data(i));
    if (inputs.some((s) => s.status === 'error')) return { status: 'error', data: null };
    if (inputs.some((s) => s.status !== 'ok')) return { status: 'loading', data: null };
    try {
      const out = c.fn(...inputs.map((s) => s.data));
      calcCache[id] = { status: 'ok', data: out };
    } catch (err) {
      console.error('[dash-shim] calc failed', id, err);
      calcCache[id] = { status: 'error', data: null, message: String(err) };
    }
    return calcCache[id];
  }

  function runDraw(d) {
    document.querySelectorAll('[data-draw="' + d.name + '"]').forEach((el) => {
      try { d.fn(el); } catch (err) { console.error('[dash-shim] draw failed', d.name, err); }
    });
  }

  function runAll() {
    rafPending = false;
    listeners.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });
    draws.forEach(runDraw);
    document.querySelectorAll('[data-draw].dash-skeleton').forEach((el) => {
      const src = (el.getAttribute('data-source') || '').split(/\s+/).filter(Boolean);
      if (src.length && src.every((s) => dash.data(s).status !== 'loading')) el.classList.remove('dash-skeleton');
    });
  }

  function schedule() {
    if (!started || rafPending) return;
    rafPending = true;
    requestAnimationFrame(runAll);
  }

  const COLORS = Array.from({ length: 8 }, (_, i) => 'var(--chart-' + i + ')');

  window.dash = {
    colors: COLORS,
    data(id) {
      if (calcs[id]) return calcResult(id);
      if (!store[id]) load(id);
      return store[id];
    },
    calc(id, spec) { calcs[id] = { inputs: spec.inputs || [], fn: spec.fn }; (spec.inputs || []).forEach((i) => { if (!calcs[i]) load(i); }); },
    loader() {},
    draw(name, fn) {
      if (typeof fn === 'function') { draws.push({ name, fn }); if (started) schedule(); return; }
      if (fn && typeof fn === 'object' && fn.update) {
        const spec = fn; const made = new WeakMap();
        draws.push({ name, fn: (el) => { if (!made.has(el)) made.set(el, spec.mount ? spec.mount(el) : undefined); spec.update(el, made.get(el)); } });
        if (started) schedule(); return;
      }
      draws.filter((d) => d.name === name).forEach(runDraw);
    },
    onData(fn) { listeners.push(fn); if (started) schedule(); },
    params() { return {}; },
    setParams() {}, resetParams() {}, setLink() {},
    refresh(id) { delete store[id]; load(id); },
  };

  function start() {
    started = true;
    document.querySelectorAll('[data-source]').forEach((el) => {
      el.getAttribute('data-source').split(/\s+/).filter(Boolean).forEach((s) => dash.data(s));
    });
    schedule();
    let t = null;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(schedule, 150); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else setTimeout(start, 0);
})();
