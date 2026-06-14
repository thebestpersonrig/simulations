(() => {
'use strict';

const SCALE = 25, CX = 480, CY = 240, W = 960, H = 480;
const $ = id => document.getElementById(id);
const SVG = $('optSvg');
const SUBS = '₁₂₃₄₅₆₇₈₉';

const state = {
  type: 'convex-lens',
  f: 8,
  objDist: 16,
  objH: 3,
  dragging: false,
  mode: 'explore',
  problem: null,
  answered: false,
  solved: false,
  qCount: 0,
  stats: loadStats(),
};

function isLens() { return state.type.includes('lens'); }
function isConverging() { return state.type === 'convex-lens' || state.type === 'concave-mirror'; }

function signedF() {
  if (state.type === 'convex-lens') return state.f;
  if (state.type === 'concave-lens') return -state.f;
  if (state.type === 'concave-mirror') return -state.f;
  return state.f;
}

function compute(objDist, fLen, type) {
  const d = objDist || state.objDist;
  const f = fLen !== undefined ? fLen : signedF();
  const lens = (type || state.type).includes('lens');
  const u = -d;
  let v, m;
  if (lens) {
    const den = u + f;
    if (Math.abs(den) < 0.01) return { v: 9999, m: 9999, real: false, inverted: false, nature: 'Image at infinity' };
    v = f * u / den;
    m = v / u;
  } else {
    const den = u - f;
    if (Math.abs(den) < 0.01) return { v: 9999, m: 9999, real: false, inverted: false, nature: 'Image at infinity' };
    v = f * u / den;
    m = -v / u;
  }
  const real = lens ? v > 0 : v < 0;
  const inverted = m < 0;
  const sz = Math.abs(m) > 1.02 ? 'Magnified' : Math.abs(m) < 0.98 ? 'Diminished' : 'Same size';
  return { v, m, absV: Math.abs(v), absM: Math.abs(m), real, inverted, size: sz,
    nature: `${real ? 'Real' : 'Virtual'}, ${inverted ? 'Inverted' : 'Upright'}, ${sz}` };
}

function drawAxis() {
  return `<line x1="10" y1="${CY}" x2="${W - 10}" y2="${CY}" class="axis-line"/>`;
}

function drawElement() {
  const lens = isLens();
  const convex = state.type === 'convex-lens' || state.type === 'convex-mirror';
  const hh = 120;
  let s = '';
  if (lens) {
    if (convex) {
      s += `<path d="M${CX} ${CY - hh} Q${CX + 18} ${CY} ${CX} ${CY + hh} Q${CX - 18} ${CY} ${CX} ${CY - hh}Z" class="lens-body"/>`;
      s += `<line x1="${CX}" y1="${CY - hh - 10}" x2="${CX}" y2="${CY - hh}" class="lens-edge"/>`;
      s += `<line x1="${CX}" y1="${CY + hh}" x2="${CX}" y2="${CY + hh + 10}" class="lens-edge"/>`;
    } else {
      s += `<path d="M${CX - 6} ${CY - hh} Q${CX + 8} ${CY} ${CX - 6} ${CY + hh}" class="lens-edge"/>`;
      s += `<path d="M${CX + 6} ${CY - hh} Q${CX - 8} ${CY} ${CX + 6} ${CY + hh}" class="lens-edge"/>`;
      s += `<line x1="${CX - 6}" y1="${CY - hh}" x2="${CX + 6}" y2="${CY - hh}" class="lens-edge"/>`;
      s += `<line x1="${CX - 6}" y1="${CY + hh}" x2="${CX + 6}" y2="${CY + hh}" class="lens-edge"/>`;
      s += `<line x1="${CX - 6}" y1="${CY - hh}" x2="${CX - 6}" y2="${CY - hh - 10}" class="lens-edge"/>`;
      s += `<line x1="${CX + 6}" y1="${CY - hh}" x2="${CX + 6}" y2="${CY - hh - 10}" class="lens-edge"/>`;
      s += `<line x1="${CX - 6}" y1="${CY + hh}" x2="${CX - 6}" y2="${CY + hh + 10}" class="lens-edge"/>`;
      s += `<line x1="${CX + 6}" y1="${CY + hh}" x2="${CX + 6}" y2="${CY + hh + 10}" class="lens-edge"/>`;
    }
  } else {
    const curveX = convex ? -25 : 25;
    s += `<path d="M${CX} ${CY - hh} Q${CX + curveX} ${CY} ${CX} ${CY + hh}" class="mirror-arc"/>`;
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = CY - hh + t * 2 * hh;
      const bx = CX + curveX * 4 * t * (1 - t);
      const hLen = 8;
      if (convex) {
        s += `<line x1="${bx}" y1="${y}" x2="${bx - hLen}" y2="${y - 4}" class="mirror-hatch"/>`;
      } else {
        s += `<line x1="${bx}" y1="${y}" x2="${bx + hLen}" y2="${y - 4}" class="mirror-hatch"/>`;
      }
    }
  }
  return s;
}

function drawObject() {
  const ox = CX - state.objDist * SCALE;
  const oy = CY - state.objH * SCALE;
  return `<g class="draggable">
<line x1="${ox}" y1="${CY}" x2="${ox}" y2="${oy}" class="obj-arrow"/>
<polygon points="${ox},${oy} ${ox - 6},${oy + 14} ${ox + 6},${oy + 14}" class="obj-head"/>
<circle cx="${ox}" cy="${CY}" r="4" class="obj-base"/>
<rect x="${ox - 14}" y="${oy - 8}" width="28" height="${CY - oy + 16}" fill="transparent" class="draggable"/>
</g>`;
}

function drawImage() {
  const r = compute();
  if (!isFinite(r.v) || Math.abs(r.v) > 80) return '';
  const ix = CX + r.v * SCALE;
  const imgH = r.m * state.objH * SCALE;
  const iy = CY - imgH;
  if (ix < 10 || ix > W - 10) return '';
  const virt = !r.real;
  const cls = virt ? 'img-arrow img-arrow-virtual' : 'img-arrow';
  const tipDir = imgH > 0 ? -1 : 1;
  return `<line x1="${ix}" y1="${CY}" x2="${ix}" y2="${iy}" class="${cls}"/>
<polygon points="${ix},${iy} ${ix - 5},${iy + tipDir * 12} ${ix + 5},${iy + tipDir * 12}" class="img-head" opacity="${virt ? 0.55 : 0.85}"/>`;
}

function clipX(x) { return Math.max(10, Math.min(W - 10, x)); }

function drawRays() {
  const r = compute();
  if (!isFinite(r.v) || Math.abs(r.v) > 80) return '';
  const ox = CX - state.objDist * SCALE;
  const oy = CY - state.objH * SCALE;
  const ix = CX + r.v * SCALE;
  const imgH = r.m * state.objH * SCALE;
  const iy = CY - imgH;
  const sf = signedF();
  let s = '';

  if (isLens()) {
    const f2x = CX + sf * SCALE;

    // Ray 1: parallel → through F'
    s += ln(ox, oy, CX, oy, 'ray ray-1 ray-solid');
    if (r.real) {
      s += ln(CX, oy, clipX(ix), iy, 'ray ray-1 ray-solid');
    } else {
      const dx = f2x - CX, dy = CY - oy;
      const ext = dx !== 0 ? (W - CX) / dx : 10;
      s += ln(CX, oy, clipX(CX + dx * ext), oy + dy * ext, 'ray ray-1 ray-solid');
      s += ln(clipX(ix), iy, CX, oy, 'ray ray-1 ray-dashed');
    }

    // Ray 2: through center
    if (r.real) {
      s += ln(ox, oy, clipX(ix), iy, 'ray ray-2 ray-solid');
    } else {
      const dx = CX - ox, dy = CY - oy;
      const ext = dx !== 0 ? (W - ox) / dx : 10;
      s += ln(ox, oy, clipX(ox + dx * ext), oy + dy * ext, 'ray ray-2 ray-solid');
      s += ln(clipX(ix), iy, CX, CY, 'ray ray-2 ray-dashed');
    }

    // Ray 3: through F₁ → parallel
    const f1x = CX - sf * SCALE;
    const dx3 = f1x - ox, dy3 = CY - oy;
    const t3 = dx3 !== 0 ? (CX - ox) / dx3 : 1;
    const yLens = oy + dy3 * t3;
    s += ln(ox, oy, CX, yLens, 'ray ray-3 ray-solid');
    if (r.real) {
      s += ln(CX, yLens, clipX(ix), iy, 'ray ray-3 ray-solid');
    } else {
      s += ln(CX, yLens, W - 10, yLens, 'ray ray-3 ray-solid');
      s += ln(clipX(ix), iy, CX, yLens, 'ray ray-3 ray-dashed');
    }
  } else {
    // Mirror rays
    const fDist = Math.abs(sf) * SCALE;
    const fx = CX - fDist;
    const cx2 = CX - 2 * fDist;
    const isConcave = state.type === 'concave-mirror';

    // Ray 1: parallel → reflects through/from F
    s += ln(ox, oy, CX, oy, 'ray ray-1 ray-solid');
    if (r.real) {
      s += ln(CX, oy, clipX(ix), iy, 'ray ray-1 ray-solid');
    } else {
      const dx = CX - fx, dy = oy - CY;
      const ext = Math.abs(dx) > 0.1 ? (CX - 10) / dx : 10;
      s += ln(CX, oy, clipX(CX - dx * ext), oy - dy * ext, 'ray ray-1 ray-solid');
      s += ln(CX, oy, clipX(ix), iy, 'ray ray-1 ray-dashed');
    }

    // Ray 2: through C → reflects back
    const dx2 = cx2 - ox, dy2 = CY - oy;
    const t2 = dx2 !== 0 ? (CX - ox) / dx2 : 1;
    const yM2 = oy + dy2 * t2;
    s += ln(ox, oy, CX, yM2, 'ray ray-2 ray-solid');
    if (r.real) {
      s += ln(CX, yM2, clipX(ix), iy, 'ray ray-2 ray-solid');
    } else {
      const backDx = ox - CX, backDy = oy - yM2;
      const ext = Math.abs(backDx) > 0.1 ? (CX - 10) / Math.abs(backDx) : 10;
      s += ln(CX, yM2, clipX(CX + backDx * ext), yM2 + backDy * ext, 'ray ray-2 ray-solid');
      s += ln(CX, yM2, clipX(ix), iy, 'ray ray-2 ray-dashed');
    }

    // Ray 3: through F → reflects parallel
    const dx3 = fx - ox, dy3 = CY - oy;
    const t3 = dx3 !== 0 ? (CX - ox) / dx3 : 1;
    const yM3 = oy + dy3 * t3;
    s += ln(ox, oy, CX, yM3, 'ray ray-3 ray-solid');
    if (r.real) {
      s += ln(CX, yM3, clipX(ix), iy, 'ray ray-3 ray-solid');
    } else {
      s += ln(CX, yM3, 10, yM3, 'ray ray-3 ray-solid');
      s += ln(CX, yM3, clipX(ix), iy, 'ray ray-3 ray-dashed');
    }
  }
  return s;
}

function ln(x1, y1, x2, y2, cls) {
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${cls}"/>`;
}

function drawLabels() {
  const sf = signedF();
  let s = '';
  if (isLens()) {
    const f1x = CX - sf * SCALE, f2x = CX + sf * SCALE;
    const c1x = CX - 2 * sf * SCALE, c2x = CX + 2 * sf * SCALE;
    s += dot(f1x, CY, 'F');
    s += dot(f2x, CY, "F'");
    s += dot(c1x, CY, '2F');
    s += dot(c2x, CY, "2F'");
    s += dot(CX, CY, 'O');
  } else {
    const fDist = Math.abs(sf) * SCALE;
    s += dot(CX - fDist, CY, 'F');
    s += dot(CX - 2 * fDist, CY, 'C');
    s += dot(CX, CY, 'P');
  }
  return s;
}

function dot(x, y, label) {
  if (x < 15 || x > W - 15) return '';
  return `<circle cx="${x}" cy="${y}" r="3" class="mark-dot"/>
<text x="${x}" y="${y + 18}" class="mark-label">${label}</text>`;
}

function renderAll() {
  const useP = state.mode === 'practice' && state.problem;
  const savedType = state.type, savedF = state.f, savedDist = state.objDist, savedH = state.objH;
  if (useP) {
    state.type = state.problem.type;
    state.f = state.problem.f;
    state.objDist = state.problem.objDist;
    state.objH = state.problem.objH;
  }
  $('axisG').innerHTML = drawAxis();
  $('elementG').innerHTML = drawElement();
  $('rayG').innerHTML = drawRays();
  $('objectG').innerHTML = drawObject();
  $('imageG').innerHTML = drawImage();
  $('labelG').innerHTML = drawLabels();
  if (state.mode === 'explore') updateReadings();
  if (useP) {
    state.type = savedType;
    state.f = savedF;
    state.objDist = savedDist;
    state.objH = savedH;
  }
}

function updateReadings() {
  const r = compute();
  const box = $('readingsBox');
  if (!isFinite(r.v) || Math.abs(r.v) > 80) {
    box.innerHTML = '<p class="phase-note">Image at infinity — object is at the focal point</p>';
    return;
  }
  const typeName = state.type.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
  let h = '';
  h += `<div class="ro-row"><span>Element</span><b class="mono">${typeName}</b></div>`;
  h += `<div class="ro-row"><span>Focal length (f)</span><b class="mono">${state.f.toFixed(1)} cm</b></div>`;
  h += `<div class="ro-row"><span>Object dist (u)</span><b class="mono">${state.objDist.toFixed(1)} cm</b></div>`;
  h += `<hr class="panel-sep">`;
  h += `<div class="ro-row ro-total"><span>Image dist (v)</span><b class="mono">${r.absV.toFixed(2)} cm</b></div>`;
  h += `<div class="ro-row"><span>Magnification</span><b class="mono">${r.absM.toFixed(2)}×</b></div>`;
  h += `<div class="ro-row"><span>Image height</span><b class="mono">${(r.absM * state.objH).toFixed(2)} cm</b></div>`;
  h += `<hr class="panel-sep">`;
  const bc = r.real ? 'nature-real' : 'nature-virtual';
  h += `<span class="nature-badge ${bc}">${r.nature}</span>`;
  box.innerHTML = h;
}

/* ---- Drag ---- */
function onPointerDown(e) {
  if (state.mode === 'practice') return;
  const p = svgPt(e);
  const ox = CX - state.objDist * SCALE;
  if (Math.abs(p.x - ox) < 30 && p.y < CY + 20) {
    state.dragging = true;
    SVG.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
}
function onPointerMove(e) {
  if (!state.dragging) return;
  const p = svgPt(e);
  const d = (CX - p.x) / SCALE;
  state.objDist = Math.max(1, Math.min(18, d));
  renderAll();
}
function onPointerUp() { state.dragging = false; }

function svgPt(e) {
  const r = SVG.getBoundingClientRect(), vb = SVG.viewBox.baseVal;
  return { x: (e.clientX - r.left) / r.width * vb.width, y: (e.clientY - r.top) / r.height * vb.height };
}

/* ---- Practice ---- */
function genProblem() {
  const types = ['convex-lens', 'concave-lens', 'concave-mirror', 'convex-mirror'];
  const type = types[Math.floor(Math.random() * types.length)];
  const fVals = [5, 6, 8, 10, 12];
  const f = fVals[Math.floor(Math.random() * fVals.length)];
  const conv = type === 'convex-lens' || type === 'concave-mirror';
  const minD = conv ? Math.max(3, f - 3) : 5;
  const maxD = conv ? f * 3 : 18;
  const dPool = [];
  for (let d = minD; d <= maxD; d += 1) dPool.push(d);
  const objDist = dPool[Math.floor(Math.random() * dPool.length)];
  const objH = 3;

  const lens = type.includes('lens');
  const sf = type === 'convex-lens' ? f : type === 'concave-lens' ? -f : type === 'concave-mirror' ? -f : f;
  const r = compute(objDist, sf, type);

  const qs = [];
  if (isFinite(r.v) && Math.abs(r.v) < 80) {
    qs.push({ q: `What is the image distance (v)?`, a: Math.round(r.absV * 100) / 100, u: 'cm', k: 'v' });
    qs.push({ q: `What is the magnification?`, a: Math.round(r.absM * 100) / 100, u: '×', k: 'm' });
  }
  if (qs.length === 0) return genProblem();
  const pick = qs[Math.floor(Math.random() * qs.length)];

  const typeName = type.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
  const qFull = `${typeName}, f = ${f} cm, u = ${objDist} cm.\n${pick.q}`;
  return { type, f, objDist, objH, sf, result: r, qText: qFull, answer: pick.a, unit: pick.u, key: pick.k, typeName };
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
  const tol = Math.max(exp * 0.05, 0.3);
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
  const p = state.problem;
  if (!p) return;
  const lens = p.type.includes('lens');
  const formula = lens ? '1/v = 1/f + 1/u' : '1/v = 1/f − 1/u';
  let s = '<ol>';
  s += `<li>Element: <b>${p.typeName}</b>, f = ${p.f} cm, u = ${p.objDist} cm</li>`;
  s += `<li>Using ${lens ? 'lens' : 'mirror'} formula: ${formula}</li>`;
  s += `<li>Image distance v = <b>${p.result.absV.toFixed(2)} cm</b> (${p.result.real ? 'real' : 'virtual'})</li>`;
  s += `<li>Magnification m = <b>${p.result.absM.toFixed(2)}×</b> (${p.result.inverted ? 'inverted' : 'upright'})</li>`;
  s += `<li class="sol-final">Answer: <b>${p.answer.toFixed(2)} ${p.unit}</b></li>`;
  s += '</ol>';
  $('solutionBox').innerHTML = s;
  $('solutionBox').hidden = false;
}

function loadStats() {
  try { return JSON.parse(localStorage.getItem('simlab-ro-stats')) || { solved: 0, correct: 0, streak: 0, best: 0 }; }
  catch { return { solved: 0, correct: 0, streak: 0, best: 0 }; }
}
function saveStats() { localStorage.setItem('simlab-ro-stats', JSON.stringify(state.stats)); }
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

function setType(t) {
  state.type = t;
  document.querySelectorAll('.pal-btn[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === t));
  renderAll();
}

function init() {
  renderAll();

  document.querySelectorAll('.pal-btn[data-type]').forEach(btn =>
    btn.addEventListener('click', () => setType(btn.dataset.type)));

  $('fSlider').addEventListener('input', () => {
    state.f = parseFloat($('fSlider').value);
    $('fDisp').textContent = state.f + ' cm';
    renderAll();
  });
  $('hSlider').addEventListener('input', () => {
    state.objH = parseFloat($('hSlider').value);
    $('hDisp').textContent = state.objH + ' cm';
    renderAll();
  });

  SVG.addEventListener('pointerdown', onPointerDown);
  SVG.addEventListener('pointermove', onPointerMove);
  SVG.addEventListener('pointerup', onPointerUp);
  SVG.addEventListener('pointercancel', onPointerUp);

  $('tabExplore').addEventListener('click', () => setMode('explore'));
  $('tabPractice').addEventListener('click', () => setMode('practice'));
  $('btnCheck').addEventListener('click', checkAnswer);
  $('btnNew').addEventListener('click', newProblem);
  $('btnSolution').addEventListener('click', showSolution);
  $('ansInput').addEventListener('keydown', e => { if (e.key === 'Enter') checkAnswer(); });

  $('btnHelp').addEventListener('click', () => $('helpDlg').showModal());
  $('btnHelpClose').addEventListener('click', () => $('helpDlg').close());
  $('helpDlg').addEventListener('click', e => { if (e.target === $('helpDlg')) $('helpDlg').close(); });

  updateStatsUI();
}

init();
})();
