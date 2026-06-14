(() => {
'use strict';

const W = 960, H = 560, CELL = 40, COLS = 24, ROWS = 14;
const K = 9e9;
const $ = id => document.getElementById(id);
const SVG = $('fieldSvg');
const SUBS = '₁₂₃₄₅₆₇₈₉';
const LINES_PER_CHARGE = 16;

let nextId = 1;
const state = {
  tool: 'positive',
  charges: [],
  sel: null,
  dragging: null,
  mode: 'explore',
  problem: null,
  answered: false,
  solved: false,
  qCount: 0,
  stats: loadStats(),
};

function buildGrid() {
  let s = '';
  for (let x = 0; x <= COLS; x++)
    for (let y = 0; y <= ROWS; y++)
      s += `<circle cx="${x * CELL}" cy="${y * CELL}" r="1.5" class="gdot"/>`;
  return s;
}

function fieldAt(x, y, charges) {
  let Ex = 0, Ey = 0;
  const list = charges || state.charges;
  for (const c of list) {
    const dx = x - c.x, dy = y - c.y;
    const r2 = dx * dx + dy * dy;
    if (r2 < 100) return { Ex: 0, Ey: 0, mag: 0 };
    const r = Math.sqrt(r2);
    const E = c.q / r2;
    Ex += E * dx / r;
    Ey += E * dy / r;
  }
  return { Ex, Ey, mag: Math.sqrt(Ex * Ex + Ey * Ey) };
}

function traceFieldLine(sx, sy, dir) {
  const pts = [{ x: sx, y: sy }];
  let x = sx, y = sy;
  const step = 4;
  for (let i = 0; i < 600; i++) {
    const f = fieldAt(x, y);
    if (f.mag < 1e-6) break;
    const nx = x + dir * step * f.Ex / f.mag;
    const ny = y + dir * step * f.Ey / f.mag;
    if (nx < -20 || nx > W + 20 || ny < -20 || ny > H + 20) { pts.push({ x: nx, y: ny }); break; }
    for (const c of state.charges) {
      const dx = nx - c.x, dy = ny - c.y;
      if (dx * dx + dy * dy < 144) {
        if (c.q * dir < 0) { pts.push({ x: c.x, y: c.y }); return pts; }
        return pts;
      }
    }
    pts.push({ x: nx, y: ny });
    x = nx; y = ny;
  }
  return pts;
}

function renderFieldLines() {
  if (!state.charges.length) return '';
  let s = '';
  const positives = state.charges.filter(c => c.q > 0);
  const sources = positives.length ? positives : state.charges;
  const dir = positives.length ? 1 : -1;

  for (const c of sources) {
    for (let i = 0; i < LINES_PER_CHARGE; i++) {
      const angle = (2 * Math.PI * i) / LINES_PER_CHARGE;
      const sx = c.x + 14 * Math.cos(angle);
      const sy = c.y + 14 * Math.sin(angle);
      const pts = traceFieldLine(sx, sy, dir);
      if (pts.length < 3) continue;
      let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
      for (let j = 1; j < pts.length; j++) d += ` L${pts[j].x.toFixed(1)},${pts[j].y.toFixed(1)}`;
      s += `<path d="${d}" class="field-line"/>`;
    }
  }
  return s;
}

function renderCharges() {
  let s = '';
  for (const c of state.charges) {
    const cls = c.q > 0 ? 'charge-pos' : 'charge-neg';
    const sel = c.id === state.sel ? ' charge-sel' : '';
    const glow = c.q > 0 ? 'url(#posGlow)' : 'url(#negGlow)';
    s += `<g class="charge ${cls}${sel}" data-id="${c.id}" transform="translate(${c.x},${c.y})" filter="url(#chargeSh)" style="cursor:grab">`;
    s += `<circle r="28" fill="${glow}"/>`;
    s += `<circle r="16" class="charge-body"/>`;
    s += `<text y="6" class="charge-sign">${c.q > 0 ? '+' : '−'}</text>`;
    s += `<text y="32" class="charge-label">${c.label}</text>`;
    s += `</g>`;
  }
  return s;
}

function renderAll() {
  const useP = state.mode === 'practice' && state.problem;
  const saved = state.charges;
  if (useP) state.charges = state.problem.charges;
  $('lineG').innerHTML = renderFieldLines();
  $('chargeG').innerHTML = renderCharges();
  if (state.mode === 'explore') updateInfo();
  if (useP) state.charges = saved;
}

function updateInfo() {
  const box = $('infoBox');
  if (!state.charges.length) { box.innerHTML = '<p class="phase-note">Place at least one charge to see field information</p>'; return; }
  let h = `<div class="ro-row"><span>Charges</span><b class="mono">${state.charges.length}</b></div>`;
  const posN = state.charges.filter(c => c.q > 0).length;
  const negN = state.charges.filter(c => c.q < 0).length;
  h += `<div class="ro-row"><span>Positive / Negative</span><b class="mono">${posN} / ${negN}</b></div>`;
  h += `<hr class="panel-sep">`;
  h += '<ul class="charge-list">';
  state.charges.forEach(c => {
    const dotCls = c.q > 0 ? 'charge-dot-pos' : 'charge-dot-neg';
    const pos = `(${Math.round(c.x)}, ${Math.round(c.y)})`;
    h += `<li><span class="charge-dot ${dotCls}"></span><span class="mono">${c.label}</span><span class="mono" style="color:var(--mut);margin-left:auto">${pos}</span></li>`;
  });
  h += '</ul>';

  if (state.sel) {
    const sc = state.charges.find(c => c.id === state.sel);
    if (sc) {
      h += `<hr class="panel-sep">`;
      h += `<div class="ctrl-label" style="margin-bottom:4px">Force on ${sc.label}</div>`;
      let Fx = 0, Fy = 0;
      state.charges.forEach(c2 => {
        if (c2.id === sc.id) return;
        const dx = sc.x - c2.x, dy = sc.y - c2.y;
        const r2 = dx * dx + dy * dy;
        if (r2 < 1) return;
        const r = Math.sqrt(r2);
        const F = sc.q * c2.q / r2;
        Fx += F * dx / r;
        Fy += F * dy / r;
      });
      const Fmag = Math.sqrt(Fx * Fx + Fy * Fy);
      h += `<div class="ro-row"><span>|F|</span><b class="mono">${Fmag.toFixed(3)} (arb)</b></div>`;
      const angle = Math.atan2(-Fy, Fx) * 180 / Math.PI;
      h += `<div class="ro-row"><span>Direction</span><b class="mono">${angle.toFixed(1)}°</b></div>`;
    }
  }
  box.innerHTML = h;
}

function autoLabel(q) {
  const pre = q > 0 ? 'Q' : 'Q';
  const sign = q > 0 ? '+' : '−';
  const n = state.charges.filter(c => (c.q > 0) === (q > 0)).length;
  const sub = n < 9 ? SUBS[n] : String(n + 1);
  return sign + pre + sub;
}

function addCharge(x, y, q) {
  const id = 'ch' + (nextId++);
  state.charges.push({ id, x, y, q, label: autoLabel(q) });
  state.sel = id;
  renderAll();
}

function svgPt(e) {
  const r = SVG.getBoundingClientRect(), vb = SVG.viewBox.baseVal;
  return { x: (e.clientX - r.left) / r.width * vb.width, y: (e.clientY - r.top) / r.height * vb.height };
}

function findChargeAt(x, y) {
  for (let i = state.charges.length - 1; i >= 0; i--) {
    const c = state.charges[i];
    const dx = x - c.x, dy = y - c.y;
    if (dx * dx + dy * dy < 400) return c;
  }
  return null;
}

function onPointerDown(e) {
  if (state.mode === 'practice') return;
  const p = svgPt(e);
  const hit = findChargeAt(p.x, p.y);

  if (hit) {
    state.dragging = hit;
    state.sel = hit.id;
    SVG.setPointerCapture(e.pointerId);
    e.preventDefault();
    renderAll();
    return;
  }

  if (state.tool === 'positive') { addCharge(p.x, p.y, 1); }
  else if (state.tool === 'negative') { addCharge(p.x, p.y, -1); }
  else if (state.tool === 'dipole') {
    addCharge(p.x - 60, p.y, 1);
    addCharge(p.x + 60, p.y, -1);
    state.sel = null;
  }
}

function onPointerMove(e) {
  if (!state.dragging) return;
  const p = svgPt(e);
  state.dragging.x = Math.max(20, Math.min(W - 20, p.x));
  state.dragging.y = Math.max(20, Math.min(H - 20, p.y));
  renderAll();
}

function onPointerUp() { state.dragging = null; }

function onKeyDown(e) {
  if (e.target.tagName === 'INPUT') return;
  if (state.mode === 'practice') return;
  switch (e.key) {
    case 'Delete': case 'Backspace':
      if (state.sel) {
        state.charges = state.charges.filter(c => c.id !== state.sel);
        state.sel = null;
        renderAll();
      }
      break;
    case 'Escape': state.sel = null; renderAll(); break;
  }
}

function setTool(t) {
  state.tool = t;
  document.querySelectorAll('.pal-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  const tips = {
    positive: 'Click the canvas to place a positive charge',
    negative: 'Click the canvas to place a negative charge',
    move: 'Click and drag charges to reposition them',
    dipole: 'Click to place a +/− dipole pair',
  };
  $('tipText').textContent = tips[t] || '';
}

/* ---- Practice ---- */
function genProblem() {
  const qPool = [1, 2, 3, 4, 5, 6, 8, 10];
  const rPool = [10, 15, 20, 25, 30, 40, 50];
  const Q1 = qPool[Math.floor(Math.random() * qPool.length)];
  const Q2 = qPool[Math.floor(Math.random() * qPool.length)];
  const r_cm = rPool[Math.floor(Math.random() * rPool.length)];
  const r_m = r_cm / 100;
  const Q1_C = Q1 * 1e-6;
  const Q2_C = Q2 * 1e-6;

  const qs = [];
  const F = K * Q1_C * Q2_C / (r_m * r_m);
  qs.push({ q: `Q₁ = ${Q1} μC, Q₂ = ${Q2} μC, r = ${r_cm} cm.\nWhat is the force between them?`, a: Math.round(F * 100) / 100, u: 'N', k: 'F',
    sol: `F = kQ₁Q₂/r² = 9×10⁹ × ${Q1}×10⁻⁶ × ${Q2}×10⁻⁶ / ${r_m}² = ${F.toFixed(2)} N` });
  const E = K * Q1_C / (r_m * r_m);
  qs.push({ q: `Q = ${Q1} μC. What is the field strength at r = ${r_cm} cm?`, a: Math.round(E / 1000 * 100) / 100, u: 'kN/C', k: 'E',
    sol: `E = kQ/r² = 9×10⁹ × ${Q1}×10⁻⁶ / ${r_m}² = ${(E / 1000).toFixed(2)} kN/C` });

  const pick = qs[Math.floor(Math.random() * qs.length)];

  const midX = W / 2, midY = H / 2;
  const sep = Math.min(r_cm * 4, 300);
  const charges = [
    { id: 'p1', x: midX - sep / 2, y: midY, q: 1, label: '+Q₁' },
    { id: 'p2', x: midX + sep / 2, y: midY, q: pick.k === 'F' ? (Math.random() < 0.5 ? 1 : -1) : 0, label: pick.k === 'F' ? (Math.random() < 0.5 ? '+Q₂' : '−Q₂') : '' },
  ];
  if (pick.k === 'E') charges.pop();

  return { charges, qText: pick.q, answer: pick.a, unit: pick.u, key: pick.k, solution: pick.sol };
}

function newProblem() {
  state.qCount++;
  state.problem = genProblem();
  state.answered = false;
  state.solved = false;
  $('qNum').textContent = '#' + state.qCount;
  $('qText').textContent = state.problem.qText;
  $('ansUnit').textContent = state.problem.unit;
  $('ansInput').value = '';
  $('ansInput').disabled = false;
  $('btnCheck').disabled = false;
  $('feedback').hidden = true;
  $('solutionBox').hidden = true;
  renderAll();
}

function checkAnswer() {
  if (state.answered) return;
  const val = parseFloat($('ansInput').value);
  if (isNaN(val)) { $('ansInput').parentElement.classList.add('shake'); setTimeout(() => $('ansInput').parentElement.classList.remove('shake'), 400); return; }
  const exp = state.problem.answer;
  const tol = Math.max(exp * 0.05, 0.1);
  const ok = Math.abs(val - exp) <= tol;
  state.answered = true;
  const first = !state.solved;
  state.solved = true;
  $('ansInput').disabled = true;
  $('btnCheck').disabled = true;
  const fb = $('feedback');
  fb.hidden = false;
  if (ok) {
    fb.className = 'feedback ok';
    fb.textContent = 'Correct!';
    if (first) { state.stats.solved++; state.stats.correct++; state.stats.streak++; state.stats.best = Math.max(state.stats.best, state.stats.streak); }
  } else {
    fb.className = 'feedback err';
    fb.textContent = `Not quite — expected ${exp.toFixed(2)} ${state.problem.unit}`;
    if (first) { state.stats.solved++; state.stats.streak = 0; }
  }
  saveStats(); updateStatsUI();
}

function showSolution() {
  if (!state.problem) return;
  $('solutionBox').innerHTML = `<ol><li>${state.problem.solution}</li><li class="sol-final">Answer: <b>${state.problem.answer.toFixed(2)} ${state.problem.unit}</b></li></ol>`;
  $('solutionBox').hidden = false;
}

function loadStats() {
  try { return JSON.parse(localStorage.getItem('simlab-ef-stats')) || { solved: 0, correct: 0, streak: 0, best: 0 }; }
  catch { return { solved: 0, correct: 0, streak: 0, best: 0 }; }
}
function saveStats() { localStorage.setItem('simlab-ef-stats', JSON.stringify(state.stats)); }
function updateStatsUI() {
  const s = state.stats;
  $('stSolved').textContent = s.solved;
  $('stAcc').textContent = s.solved > 0 ? Math.round(s.correct / s.solved * 100) + '%' : '—';
  $('stStreak').textContent = s.streak;
  $('stBest').textContent = s.best;
}

function setMode(m) {
  state.mode = m;
  document.body.dataset.mode = m;
  $('tabExplore').classList.toggle('active', m === 'explore');
  $('tabPractice').classList.toggle('active', m === 'practice');
  if (m === 'practice') { if (!state.problem) newProblem(); else renderAll(); updateStatsUI(); }
  else renderAll();
}

function init() {
  $('gridG').innerHTML = buildGrid();
  renderAll();

  document.querySelectorAll('.pal-btn[data-tool]').forEach(btn =>
    btn.addEventListener('click', () => setTool(btn.dataset.tool)));
  $('btnClear').addEventListener('click', () => {
    state.charges = []; state.sel = null; renderAll();
    $('tipText').textContent = 'Canvas cleared — place new charges to begin';
  });

  SVG.addEventListener('pointerdown', onPointerDown);
  SVG.addEventListener('pointermove', onPointerMove);
  SVG.addEventListener('pointerup', onPointerUp);
  SVG.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('keydown', onKeyDown);

  $('tabExplore').addEventListener('click', () => setMode('explore'));
  $('tabPractice').addEventListener('click', () => setMode('practice'));
  $('btnCheck').addEventListener('click', checkAnswer);
  $('btnNew').addEventListener('click', newProblem);
  $('btnSolution').addEventListener('click', showSolution);
  $('ansInput').addEventListener('keydown', e => { if (e.key === 'Enter') checkAnswer(); });

  $('btnHelp').addEventListener('click', () => $('helpDlg').showModal());
  $('btnHelpClose').addEventListener('click', () => $('helpDlg').close());
  $('helpDlg').addEventListener('click', e => { if (e.target === $('helpDlg')) $('helpDlg').close(); });

  setTool('positive');
  updateStatsUI();
}

init();
})();
