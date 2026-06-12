'use strict';
/* ============================================================
   Vernier Calliper simulation — SimLab
   All lengths internally in "t10" units = tenths of a mm
   (1 t10 = 0.1 mm = 0.01 cm = one least count).
   ============================================================ */

const MM = 8.5;            // px per mm
const X0 = 100;            // x-coordinate of the 0 mm mark / fixed jaw face
const VDIV = 0.9 * MM;     // px per vernier division (0.9 mm)
const MAX10 = 1200;        // max jaw separation (120 mm)

const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmtCm = t10 => (t10 / 100).toFixed(2);                 // 234 -> "2.34"
const signedCm = t10 => (t10 >= 0 ? '+' : '−') + Math.abs(t10 / 100).toFixed(2);
const zeText = t10 => (t10 === 0 ? '0.00' : signedCm(t10)) + ' cm';

/* ---------------- state ---------------- */
const state = {
  mode: 'explore',        // explore | practice
  sep10: 280,             // true jaw separation
  ze10: 0,                // zero error
  view10: 280,            // animated/displayed separation
  phase: 'measure',       // practice: measure | zero
  hint: false,
  problem: null,          // { true10, ze10, num }
  answered: false,
  solved: false,
  qCount: 0,
  stats: loadStats(),
};

function loadStats() {
  const defaults = { attempts: 0, correct: 0, solved: 0, streak: 0, best: 0 };
  try {
    const s = JSON.parse(localStorage.getItem('simlab-vc-stats'));
    if (s && typeof s.attempts === 'number') return Object.assign(defaults, s);
  } catch (e) { /* fresh start */ }
  return defaults;
}
function saveStats() {
  try { localStorage.setItem('simlab-vc-stats', JSON.stringify(state.stats)); } catch (e) {}
}

/* ---------------- build the SVG scene ---------------- */
const svg = $('#vcSvg');

function buildScene() {
  let mainTicks = '', mainLabels = '';
  for (let m = 0; m <= 130; m++) {
    const x = X0 + m * MM;
    const big = m % 10 === 0, mid = m % 5 === 0;
    const h = big ? 26 : mid ? 17 : 10;
    mainTicks += `<line id="mt-${m}" class="${big ? 'big' : ''}" x1="${x}" y1="210" x2="${x}" y2="${210 - h}"/>`;
    if (big) mainLabels += `<text x="${x}" y="178">${m / 10}</text>`;
  }
  mainLabels += `<text class="unit" x="${X0 + 130 * MM + 28}" y="178">cm</text>`;

  let vTicks = '', vLabels = '';
  for (let i = 0; i <= 10; i++) {
    const x = X0 + i * VDIV;
    const h = i % 5 === 0 ? 18 : 11;
    vTicks += `<line id="vt-${i}" class="${i === 0 ? 'vzero' : ''}" x1="${x}" y1="213" x2="${x}" y2="${213 + h}"/>`;
    if (i % 5 === 0) vLabels += `<text x="${x}" y="248">${i}</text>`;
  }

  svg.innerHTML = `
  <defs>
    <linearGradient id="steelA" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3f6fc"/>
      <stop offset="0.45" stop-color="#cdd6e6"/>
      <stop offset="1" stop-color="#9fabc1"/>
    </linearGradient>
    <linearGradient id="steelB" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e3e9f3"/>
      <stop offset="0.5" stop-color="#bcc7da"/>
      <stop offset="1" stop-color="#8e9bb3"/>
    </linearGradient>
    <linearGradient id="rodGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f2b27c"/>
      <stop offset="0.4" stop-color="#d98e4e"/>
      <stop offset="1" stop-color="#8f5524"/>
    </linearGradient>
    <filter id="vcShadow" x="-5%" y="-10%" width="110%" height="130%">
      <feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#000" flood-opacity="0.4"/>
    </filter>
  </defs>

  <g id="vcScene" filter="url(#vcShadow)">

    <!-- beam / main scale -->
    <rect x="55" y="150" width="1192" height="60" rx="8"
          fill="url(#steelA)" stroke="#76829a" stroke-width="1.4"/>
    <g class="mticks">${mainTicks}</g>
    <g class="mlabels">${mainLabels}</g>

    <!-- fixed jaws -->
    <path d="M ${X0} 210 L ${X0} 320 Q ${X0} 334 ${X0 - 13} 329 L ${X0 - 31} 242 L ${X0 - 31} 210 Z"
          fill="url(#steelA)" stroke="#76829a" stroke-width="1.4"/>
    <path d="M ${X0} 151 L ${X0} 102 Q ${X0} 93 ${X0 - 9} 97 L ${X0 - 22} 151 Z"
          fill="url(#steelA)" stroke="#76829a" stroke-width="1.4"/>

    <!-- object held between jaws -->
    <g id="objWrap" style="display:none">
      <rect id="objRect" x="${X0}" y="256" width="0" height="66" rx="11" fill="url(#rodGrad)" stroke="#6e3f17" stroke-width="1.2"/>
      <text id="objLabel" class="obj-label" x="${X0}" y="297">?</text>
    </g>

    <!-- slider assembly (translated by jaw separation) -->
    <g id="sliderG">
      <!-- upper frame strip -->
      <rect x="${X0 + 18}" y="136" width="96" height="15" rx="4" fill="url(#steelB)" stroke="#76829a" stroke-width="1.2"/>
      <!-- lock screw -->
      <circle cx="${X0 + 66}" cy="143" r="6" fill="#aab4c8" stroke="#76829a" stroke-width="1.2"/>
      <line x1="${X0 + 62}" y1="143" x2="${X0 + 70}" y2="143" stroke="#5d6a82" stroke-width="1.6"/>
      <!-- right bridge over the beam -->
      <rect x="${X0 + 92}" y="138" width="26" height="118" rx="5" fill="url(#steelB)" stroke="#76829a" stroke-width="1.2"/>
      <!-- vernier plate -->
      <rect x="${X0 - 2}" y="211" width="120" height="46" rx="5" fill="url(#steelB)" stroke="#76829a" stroke-width="1.2"/>
      <!-- thumb grip -->
      <circle cx="${X0 + 105}" cy="234" r="11" fill="#c3cdde" stroke="#76829a" stroke-width="1.2"/>
      <circle cx="${X0 + 105}" cy="234" r="7" fill="none" stroke="#8b97ad" stroke-width="1.6" stroke-dasharray="2.2 2.4"/>
      <!-- sliding jaws -->
      <path d="M ${X0} 210 L ${X0} 320 Q ${X0} 334 ${X0 + 13} 329 L ${X0 + 31} 242 L ${X0 + 31} 210 Z"
            fill="url(#steelB)" stroke="#76829a" stroke-width="1.4"/>
      <path d="M ${X0} 151 L ${X0} 102 Q ${X0} 93 ${X0 + 9} 97 L ${X0 + 22} 151 Z"
            fill="url(#steelB)" stroke="#76829a" stroke-width="1.4"/>
      <!-- vernier scale (offset by zero error) -->
      <g id="vernOff">
        <g class="vticks">${vTicks}</g>
        <g class="vlabels">${vLabels}</g>
      </g>
      <text class="brand-engraving" x="${X0 + 58}" y="269">SIMLAB · LC 0.01 cm</text>
      <!-- invisible drag handle -->
      <rect id="sliderHit" class="drag-hit" x="${X0 - 16}" y="88" width="148" height="252" fill="rgba(0,0,0,0)"/>
    </g>
  </g>`;
}

buildScene();

/* dynamic element refs */
const sliderG = $('#sliderG');
const vernOff = $('#vernOff');
const objWrap = $('#objWrap');
const objRect = $('#objRect');
const objLabel = $('#objLabel');
const magSvg = $('#magSvg');

let hlTicks = [];

/* ---------------- core render ---------------- */
function update() {
  const px = (state.view10 / 10) * MM;
  sliderG.setAttribute('transform', `translate(${px} 0)`);
  vernOff.setAttribute('transform', `translate(${(state.ze10 / 10) * MM} 0)`);

  // object between the jaws (practice only)
  const showObj = state.mode === 'practice' && px > 4;
  objWrap.style.display = showObj ? '' : 'none';
  if (showObj) {
    objRect.setAttribute('width', px);
    objLabel.setAttribute('x', X0 + px / 2);
  }

  // magnifier window follows the vernier scale
  const zeroX = X0 + ((state.view10 + state.ze10) / 10) * MM;
  magSvg.setAttribute('viewBox', `${(zeroX + 4.5 * VDIV - 95).toFixed(1)} 156 190 104`);

  // coincidence highlight
  hlTicks.forEach(el => el.classList.remove('hl'));
  hlTicks = [];
  if (state.hint) {
    const settled = state.mode === 'practice' && state.phase === 'zero' ? 0 : state.sep10;
    const R = settled + state.ze10;
    const k = ((R % 10) + 10) % 10;
    const mIdx = (R + 9 * k) / 10;
    const mt = $(`#mt-${mIdx}`), vt = $(`#vt-${k}`);
    if (mt) { mt.classList.add('hl'); hlTicks.push(mt); }
    if (vt) { vt.classList.add('hl'); hlTicks.push(vt); }
  }

  if (state.mode === 'explore') renderReadout();
}

function renderReadout() {
  const R = state.sep10 + state.ze10;          // observed reading
  const M = Math.floor(R / 10);                 // main scale, in mm
  const k = ((R % 10) + 10) % 10;               // coinciding vernier division
  $('#roMSR').textContent = (M / 10).toFixed(1) + ' cm';
  $('#roVSD').textContent = k;
  $('#roVSR').textContent = (k / 100).toFixed(2) + ' cm';
  $('#roObs').textContent = fmtCm(R) + ' cm';
  const corrRow = $('#rowCorr');
  corrRow.hidden = state.ze10 === 0;
  $('#roCorr').textContent = fmtCm(state.sep10) + ' cm';
  const note = $('#zeNote');
  if (R < 0) {
    note.hidden = false;
    note.textContent = '⚠ Vernier 0 is left of main 0 — negative zero error in action.';
  } else note.hidden = true;
}

/* ---------------- animation ---------------- */
let animId = 0;
function animateTo(target10, done) {
  cancelAnimationFrame(animId);
  const from = state.view10, d = target10 - from;
  if (Math.abs(d) < 0.01) { state.view10 = target10; update(); if (done) done(); return; }
  const t0 = performance.now(), dur = 480;
  const step = now => {
    const p = clamp((now - t0) / dur, 0, 1);
    const e = 1 - Math.pow(1 - p, 3);
    state.view10 = from + d * e;
    update();
    if (p < 1) animId = requestAnimationFrame(step);
    else { state.view10 = target10; update(); if (done) done(); }
  };
  animId = requestAnimationFrame(step);
}

/* ---------------- dragging ---------------- */
const hit = $('#sliderHit');
let drag = null;

hit.addEventListener('pointerdown', e => {
  if (state.mode !== 'explore') return;
  drag = { startX: e.clientX, start10: state.sep10 };
  hit.setPointerCapture(e.pointerId);
  e.preventDefault();
});
hit.addEventListener('pointermove', e => {
  if (!drag) return;
  const scale = svg.getBoundingClientRect().width / 1280;   // px per svg-unit
  const d10 = Math.round((e.clientX - drag.startX) / scale / MM * 10);
  state.sep10 = clamp(drag.start10 + d10, 0, MAX10);
  state.view10 = state.sep10;
  cancelAnimationFrame(animId);
  update();
});
const endDrag = () => { drag = null; };
hit.addEventListener('pointerup', endDrag);
hit.addEventListener('pointercancel', endDrag);

/* keyboard nudges */
window.addEventListener('keydown', e => {
  if (state.mode !== 'explore') return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1);
  cancelAnimationFrame(animId);
  state.sep10 = clamp(state.sep10 + d, 0, MAX10);
  state.view10 = state.sep10;
  update();
});

/* nudge buttons + close jaws + zero-error slider */
document.querySelectorAll('.nudge').forEach(b => b.addEventListener('click', () => {
  state.sep10 = clamp(state.sep10 + Number(b.dataset.d), 0, MAX10);
  animateTo(state.sep10);
  renderReadout();
}));
$('#btnCloseJaws').addEventListener('click', () => {
  state.sep10 = 0;
  animateTo(0);
  renderReadout();
});
$('#zeSlider').addEventListener('input', e => {
  state.ze10 = Number(e.target.value);
  $('#zeVal').textContent = zeText(state.ze10);
  update();
});

/* ---------------- modes ---------------- */
function setMode(m) {
  state.mode = m;
  document.body.dataset.mode = m;
  $('#tabExplore').classList.toggle('active', m === 'explore');
  $('#tabPractice').classList.toggle('active', m === 'practice');
  $('#tipText').textContent = m === 'explore'
    ? 'Drag the slider — or use ← → keys (Shift for 1 mm)'
    : 'The jaws are locked on the object — read the scales carefully';
  if (m === 'practice') {
    if (!state.problem) newProblem();
    else {
      // restore the problem's geometry — explore mode may have moved the jaws
      state.sep10 = state.problem.true10;
      state.ze10 = state.problem.ze10;
      syncPhase();
      animateTo(state.phase === 'zero' ? 0 : state.problem.true10);
    }
    renderStats();
  } else {
    state.ze10 = Number($('#zeSlider').value);
    $('#zeVal').textContent = zeText(state.ze10);
    animateTo(state.sep10);
  }
  update();
}
$('#tabExplore').addEventListener('click', () => setMode('explore'));
$('#tabPractice').addEventListener('click', () => setMode('practice'));

/* ---------------- practice: problems ---------------- */
function newProblem() {
  const useZE = $('#chkZE').checked;
  let ze = 0;
  if (useZE) {
    const mag = 1 + Math.floor(Math.random() * 5);          // 1..5 (0.01–0.05 cm)
    ze = (Math.random() < 0.5 ? -1 : 1) * mag;
  }
  let t;
  do { t = 80 + Math.floor(Math.random() * 1071); }          // 0.80–11.50 cm
  while (state.problem && t === state.problem.true10);

  state.qCount++;
  state.problem = { true10: t, ze10: ze, num: state.qCount };
  state.sep10 = t;
  state.ze10 = ze;
  state.phase = 'measure';
  state.answered = false;
  state.solved = false;

  $('#qNum').textContent = '#' + state.qCount;
  $('#qText').textContent = useZE
    ? 'A rod is held between the jaws. The calliper may have a zero error — check it, then find the corrected length of the rod.'
    : 'A rod is held between the jaws. Read the scales and find the length of the rod.';
  const inp = $('#ansInput');
  inp.value = ''; inp.disabled = false;
  $('#btnCheck').textContent = 'Check';
  $('#feedback').hidden = true;
  $('#solutionBox').hidden = true;
  syncPhase();
  animateTo(t);
  renderStats();
  update();
}

function syncPhase() {
  $('#btnMeasure').classList.toggle('active', state.phase === 'measure');
  $('#btnZero').classList.toggle('active', state.phase === 'zero');
}
$('#btnMeasure').addEventListener('click', () => {
  if (state.phase === 'measure') return;
  state.phase = 'measure'; syncPhase();
  animateTo(state.problem.true10);
});
$('#btnZero').addEventListener('click', () => {
  if (state.phase === 'zero') return;
  state.phase = 'zero'; syncPhase();
  animateTo(0);
});

/* answer checking */
function firstAttempt(correct) {
  if (state.answered) return;
  state.answered = true;
  const s = state.stats;
  s.attempts++;
  if (correct) { s.correct++; s.streak++; s.best = Math.max(s.best, s.streak); }
  else s.streak = 0;
  saveStats();
}

function check() {
  if (state.solved) { newProblem(); return; }
  const inp = $('#ansInput');
  const v = parseFloat(inp.value);
  const fb = $('#feedback');
  if (Number.isNaN(v)) {
    fb.hidden = false; fb.className = 'feedback warn';
    fb.textContent = 'Enter a number, e.g. 2.34';
    return;
  }
  const correct = Math.abs(v - state.problem.true10 / 100) < 0.005;
  firstAttempt(correct);
  fb.hidden = false;
  if (correct) {
    state.solved = true;
    state.stats.solved++;
    saveStats();
    fb.className = 'feedback ok';
    fb.textContent = `Correct — ${fmtCm(state.problem.true10)} cm 🎉  ${state.stats.streak > 1 ? 'Streak ' + state.stats.streak + '!' : 'Nicely read.'}`;
    inp.disabled = true;
    $('#btnCheck').textContent = 'Next problem →';
  } else {
    fb.className = 'feedback err';
    const hints = state.problem.ze10 !== 0
      ? 'Not quite. Did you subtract the zero error with the right sign?'
      : 'Not quite. Re-check the coinciding vernier division.';
    fb.textContent = hints + ' Try again.';
    const field = inp.closest('.ans-field');
    field.classList.remove('shake'); void field.offsetWidth;
    field.classList.add('shake');
  }
  renderStats();
}
$('#btnCheck').addEventListener('click', check);
$('#ansInput').addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
$('#btnNew').addEventListener('click', newProblem);
$('#chkZE').addEventListener('change', newProblem);

/* solution steps */
$('#btnSolution').addEventListener('click', () => {
  if (!state.solved && !state.answered) {
    state.answered = true;
    state.stats.attempts++;
    state.stats.streak = 0;
    saveStats();
    renderStats();
  }
  const { true10, ze10 } = state.problem;
  const obs = true10 + ze10;
  const M = Math.floor(obs / 10);
  const k = ((obs % 10) + 10) % 10;

  let zeStep;
  if (ze10 === 0) {
    zeStep = `Jaws closed: vernier 0 coincides with main 0 → <b>no zero error</b>.`;
  } else if (ze10 > 0) {
    zeStep = `Jaws closed: vernier 0 lies <i>right</i> of main 0, division <b>${ze10}</b> coincides → ZE = +${ze10} × 0.01 = <b>${signedCm(ze10)} cm</b>.`;
  } else {
    const kz = 10 + ze10;
    zeStep = `Jaws closed: vernier 0 lies <i>left</i> of main 0, division <b>${kz}</b> coincides → ZE = (${kz} − 10) × 0.01 = <b>${signedCm(ze10)} cm</b>.`;
  }

  const corrStep = ze10 === 0
    ? `<li>Corrected length = observed = <b class="sol-final">${fmtCm(true10)} cm</b></li>`
    : `<li>Corrected = observed − ZE = ${fmtCm(obs)} − (${signedCm(ze10)}) = <b class="sol-final">${fmtCm(true10)} cm</b></li>`;

  $('#solutionBox').innerHTML = `<ol>
    <li>Least count = 1 mm ⁄ 10 = <b>0.01 cm</b></li>
    <li>${zeStep}</li>
    <li>Main scale reading (left of vernier 0) = <b>${(M / 10).toFixed(1)} cm</b></li>
    <li>Coinciding vernier division = <b>${k}</b> → ${k} × 0.01 = <b>${(k / 100).toFixed(2)} cm</b></li>
    <li>Observed = ${(M / 10).toFixed(1)} + ${(k / 100).toFixed(2)} = <b>${fmtCm(obs)} cm</b></li>
    ${corrStep}
  </ol>`;
  $('#solutionBox').hidden = false;
});

/* stats */
function renderStats() {
  const s = state.stats;
  $('#stSolved').textContent = s.solved;
  $('#stAcc').textContent = s.attempts ? Math.round(100 * s.correct / s.attempts) + '%' : '—';
  const stk = $('#stStreak');
  stk.textContent = s.streak > 0 ? s.streak + '🔥' : '0';
  stk.classList.toggle('fire', s.streak > 1);
  $('#stBest').textContent = s.best;
}

/* ---------------- stage toggles ---------------- */
$('#btnHint').addEventListener('click', e => {
  state.hint = !state.hint;
  e.currentTarget.classList.toggle('active', state.hint);
  update();
});
$('#btnMag').addEventListener('click', e => {
  const box = $('#magBox');
  box.classList.toggle('off');
  e.currentTarget.classList.toggle('active', !box.classList.contains('off'));
});

/* help dialog */
$('#btnHelp').addEventListener('click', () => $('#helpDlg').showModal());
$('#btnHelpClose').addEventListener('click', () => $('#helpDlg').close());
$('#helpDlg').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.close();
});

/* ---------------- init ---------------- */
renderStats();
update();
