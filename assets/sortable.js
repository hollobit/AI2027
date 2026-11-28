/* Click-to-sort for every table (report, chapter pages, dashboard). No dependencies.
 * Cycle per column: ascending → descending → original order. Keyboard: Enter/Space on a header.
 * Cell values: probability % ("높음 · 85% (±10)") → date (2026-11-28) → leading number ("19.2절", "1,234건")
 * → likelihood word (거의 확실 > 높음 > 중간 > 낮음) → Korean-aware text.
 * Tables whose body uses rowspan/colspan are skipped. Rows re-rendered by scripts keep the chosen order.
 */
(function () {
  const LABEL = { '거의 확실': 4, '높음': 3, '중간': 2, '낮음': 1 };
  const coll = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

  /** @returns {{t:number, v:(number|string)}} t=0 numeric, 1 text, 3 empty */
  function key(cell) {
    const s = (cell ? cell.textContent : '').replace(/\s+/g, ' ').replace(/#$/, '').trim();
    if (!s || s === '—' || s === '-') return { t: 3, v: '' };
    const text = { t: 1, v: s };
    if (s.length > 28) return text; // long prose sorts as text even if it contains numbers
    let m = s.match(/^(\d{1,2})\.(\d{1,2})(?:[–·~,][\d.]+)*절/); // section refs: 20.16절 after 20.2절
    if (m) return { t: 0, v: +m[1] * 1000 + +m[2] };
    m = s.match(/(\d+(?:\.\d+)?)\s*%/);
    if (m) return { t: 0, v: parseFloat(m[1]) };
    m = s.match(/^(\d{4})[-.](\d{1,2})(?:[-.](\d{1,2}))?/);
    if (m) return { t: 0, v: +m[1] * 10000 + +m[2] * 100 + +(m[3] || 0) };
    m = s.replace(/,/g, '').match(/^[^\d−–-]{0,3}([−–-]?\d+(?:\.\d+)?)/);
    if (m) return { t: 0, v: parseFloat(m[1].replace(/[−–]/, '-')) };
    for (const k in LABEL) if (s.startsWith(k)) return { t: 0, v: LABEL[k] };
    return text;
  }

  /** Column is numeric only if most non-empty cells read as numbers; otherwise every cell sorts as text. */
  function columnKeys(rows, col) {
    const ks = rows.map((r) => key(r.cells[col]));
    const filled = ks.filter((k) => k.t !== 3);
    const numeric = filled.length && filled.filter((k) => k.t === 0).length / filled.length >= 0.6;
    if (numeric) return ks;
    return rows.map((r, i) => (ks[i].t === 3 ? ks[i] : { t: 1, v: (r.cells[col].textContent || '').replace(/\s+/g, ' ').trim() }));
  }

  function cmp(a, b) {
    if (a.t !== b.t) return a.t - b.t;
    return a.t === 0 ? a.v - b.v : coll.compare(a.v, b.v);
  }

  function sortable(table) {
    const head = table.tHead && table.tHead.rows[table.tHead.rows.length - 1];
    const body = table.tBodies[0];
    if (!head || !body || table.dataset.sortReady) return;
    if (body.querySelector('[rowspan],[colspan]')) return;
    table.dataset.sortReady = '1';
    let state = { col: -1, dir: 0 };
    const opts = { childList: true };
    const obs = new MutationObserver(() => {
      // rows were re-rendered by a script: forget old positions and re-apply the chosen order
      Array.from(body.rows).forEach((r) => { delete r.dataset.sortI; });
      if (state.dir !== 0 && !body.querySelector('[rowspan],[colspan]')) apply();
    });

    function apply() {
      const rows = Array.from(body.rows);
      rows.forEach((r, i) => { if (r.dataset.sortI === undefined) r.dataset.sortI = String(i); });
      let out;
      if (state.dir === 0) out = rows.sort((a, b) => a.dataset.sortI - b.dataset.sortI);
      else out = ((ks) => rows.map((r, i) => [r, ks[i]]))(columnKeys(rows, state.col))
        .sort((x, y) => cmp(x[1], y[1]) * state.dir || x[0].dataset.sortI - y[0].dataset.sortI)
        .map((x) => x[0]);
      obs.disconnect();
      out.forEach((r) => body.appendChild(r));
      obs.takeRecords();
      obs.observe(body, opts);
    }

    Array.from(head.cells).forEach((th, i) => {
      th.classList.add('sortable-th');
      th.setAttribute('tabindex', '0');
      th.setAttribute('role', 'columnheader');
      th.setAttribute('aria-sort', 'none');
      th.title = '눌러서 정렬';
      const go = () => {
        state = state.col === i ? { col: i, dir: state.dir === 1 ? -1 : state.dir === -1 ? 0 : 1 } : { col: i, dir: 1 };
        Array.from(head.cells).forEach((h, j) => h.setAttribute('aria-sort',
          j !== state.col || state.dir === 0 ? 'none' : state.dir === 1 ? 'ascending' : 'descending'));
        apply();
      };
      th.addEventListener('click', go);
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });

    obs.observe(body, opts);
  }

  function init(root) {
    (root || document).querySelectorAll('table').forEach(sortable);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();
  // tables added later (dashboard renders some after data loads)
  new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'TABLE') sortable(n); else if (n.querySelector) n.querySelectorAll('table').forEach(sortable);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
