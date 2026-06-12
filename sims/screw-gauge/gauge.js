'use strict';
/* ============================================================
   Screw Gauge (micrometer) simulation — SimLab
   Pitch = 1 mm, 100 circular divisions → LC = 0.01 mm.
   All lengths internally in "t100" units = hundredths of a mm
   (1 t100 = 0.01 mm = one least count).
   ============================================================ */

const S = 28;             // px per mm
const AX = 330;           // anvil face x
const E0 = 660;           // thimble edge x at zero reading = 0 mm mark on sleeve
const DS = 7;             // px per circular division on the thimble
const MAX100 = 1000;      // max spindle gap (10 mm)

const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmtMm = t => (t / 100).toFixed(2);                      // 737 -> "7.37"
const signedMm = t => (t >= 0 ? '+' : '−') + Math.abs(t / 100).toFixed(2);
const zeText = t => (t === 0 ? '0.00' : signedMm(t)) + ' mm';

/* ---------------- state ---------------- */
const state = {
  mode: 'explore',        // explore | practice
  val100: 737,            // true spindle gap
  ze100: 0,               // zero error
  view100: 737,           // animated/displayed gap
  phase: 'measure',       // practice: measure | zero
  hint: false,
  problem: null,          // { true100, ze100, num }
  answered: false,
  solved: false,
  qCount: 0,
  stats: loadStats(),
};

function loadStats() {
  const defaults = { attempts: 0, correct: 0, solved: 0, streak: 0, best: 0 };
  try {
    const s = JSON.parse(localStorage.getItem('simlab-sg-stats'));
    if (s && typeof s.attempts === 'number') return Object.assign(defaults, s);
  } catch (e) { /* fresh start */ }
  return defaults;
}
function saveStats() {
  try { localStorage.setItem('simlab-sg-stats', JSON.stringify(state.stats)); } catch (e) {}
}

/* ---------------- build the SVG scene ---------------- */
const svg = $('#sgSvg');

function buildScene() {
  let sTicks = '', sLabels = '';
  for (let m = 0; m <= 10; m++) {
    const x = E0 + m * S;
    const big = m % 5 === 0;
    sTicks += `<line class="${big ? 'big' : ''}" x1="${x}" y1="210" x2="${x}" y2="${big ? 196 : 199}"/>`;
    if (big) sLabels += `<text x="${x}" y="193">${m}</text>`;
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
    <linearGradient id="frameG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#414c63"/>
      <stop offset="1" stop-color="#222a3b"/>
    </linearGradient>
    <linearGradient id="rodGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f2b27c"/>
      <stop offset="0.4" stop-color="#d98e4e"/>
      <stop offset="1" stop-color="#8f5524"/>
    </linearGradient>
    <filter id="sgShadow" x="-5%" y="-10%" width="110%" height="130%">
      <feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#000" flood-opacity="0.4"/>
    </filter>
    <clipPath id="thimbClip"><rect x="${E0 + 5}" y="166" width="74" height="88"/></clipPath>
  </defs>

  <g id="sgScene" filter="url(#sgShadow)">

    <!-- U-frame -->
    <path d="M 313 236 C 270 350 320 402 470 402 C 622 402 662 330 638 248"
          fill="none" stroke="url(#frameG)" stroke-width="34" stroke-linecap="round"/>

    <!-- anvil -->
    <rect x="296" y="192" width="34" height="36" rx="3" fill="url(#steelB)" stroke="#76829a" stroke-width="1.4"/>

    <!-- wire held in the gap (practice) -->
    <g id="objWrap" style="display:none">
      <rect id="objRect" x="${AX}" y="120" width="0" height="180" rx="10" fill="url(#rodGrad)" stroke="#6e3f17" stroke-width="1.2"/>
      <text id="objLabel" class="obj-label" x="${AX}" y="166">?</text>
    </g>

    <!-- spindle rod (face position is dynamic) -->
    <rect id="spindleRod" x="${AX}" y="197" width="350" height="26" fill="url(#steelB)" stroke="#76829a" stroke-width="1.2"/>
    <rect id="spindleFace" x="${AX}" y="197" width="5" height="26" fill="#8e9bb3"/>

    <!-- sleeve / barrel with main scale -->
    <rect x="614" y="182" width="456" height="56" rx="10" fill="url(#steelA)" stroke="#76829a" stroke-width="1.4"/>
    <rect x="618" y="176" width="34" height="68" rx="8" fill="url(#steelB)" stroke="#76829a" stroke-width="1.2"/>
    <line id="refLine" x1="656" y1="210" x2="1064" y2="210"/>
    <g class="sticks">${sTicks}</g>
    <g class="slabels">${sLabels}</g>
    <text class="brand-engraving" x="745" y="232">SIMLAB · PITCH 1 mm · LC 0.01 mm</text>

    <!-- thimble assembly (translated by observed reading) -->
    <g id="thimbG">
      <rect x="${E0}" y="158" width="180" height="104" rx="14" fill="url(#steelB)" stroke="#76829a" stroke-width="1.4"/>
      <!-- bevel sits fully inside the thimble so it never hides the sleeve scale -->
      <ellipse cx="${E0 + 8}" cy="210" rx="8" ry="52" fill="url(#steelA)" stroke="#76829a" stroke-width="1.2"/>
      <g id="thimbDivs" class="tdivs" clip-path="url(#thimbClip)"></g>
      <g class="knurl" id="thimbKnurl"></g>
      <!-- ratchet -->
      <rect x="${E0 + 180}" y="186" width="36" height="48" rx="6" fill="url(#steelB)" stroke="#76829a" stroke-width="1.2"/>
      <line x1="${E0 + 189}" y1="188" x2="${E0 + 189}" y2="232" stroke="rgba(31,41,55,0.25)" stroke-width="2.4"/>
      <line x1="${E0 + 198}" y1="188" x2="${E0 + 198}" y2="232" stroke="rgba(31,41,55,0.25)" stroke-width="2.4"/>
      <line x1="${E0 + 207}" y1="188" x2="${E0 + 207}" y2="232" stroke="rgba(31,41,55,0.25)" stroke-width="2.4"/>
      <rect x="${E0 + 216}" y="194" width="14" height="32" rx="5" fill="url(#steelB)" stroke="#76829a" stroke-width="1.2"/>
      <!-- invisible drag handle -->
      <rect class="drag-hit" id="thimbHit" x="${E0 - 12}" y="146" width="256" height="128" fill="rgba(0,0,0,0)"/>
    </g>
  </g>`;

  // knurling on the thimble grip
  let kn = '';
  for (let i = 0; i < 12; i++) {
    const x = E0 + 92 + i * 7;
    kn += `<line x1="${x}" y1="164" x2="${x}" y2="256"/>`;
  }
  $('#thimbKnurl').innerHTML = kn;
}

buildScene();

/* dynamic element refs */
const thimbG = $('#thimbG');
const thimbDivs = $('#thimbDivs');
const spindleRod = $('#spindleRod');
const spindleFace = $('#spindleFace');
const objWrap = $('#objWrap');
const objRect = $('#objRect');
const objLabel = $('#objLabel');
const refLine = $('#refLine');
const magSvg = $('#magSvg');

/* ---------------- core render ---------------- */
function update() {
  const gapPx = (state.view100 / 100) * S;
  const obsCont = state.view100 + state.ze100;       // continuous observed reading
  const obsPx = (obsCont / 100) * S;

  // spindle: face at AX + gap, rod runs back under the sleeve
  const faceX = AX + Math.max(0, gapPx);
  spindleRod.setAttribute('x', faceX);
  spindleRod.setAttribute('width', Math.max(0, 680 - faceX));
  spindleFace.setAttribute('x', faceX);

  // thimble translated by the observed reading
  thimbG.setAttribute('transform', `translate(${obsPx} 0)`);

  // circular scale divisions around the reference line
  const settled = state.mode === 'practice' && state.phase === 'zero' ? 0 : state.val100;
  const settledObs = settled + state.ze100;
  let divs = '';
  const base = Math.floor(obsCont);
  for (let k = base - 8; k <= base + 8; k++) {
    const y = 210 - (k - obsCont) * DS;
    if (y < 168 || y > 252) continue;
    const big = ((k % 5) + 5) % 5 === 0;
    const hl = state.hint && k === settledObs ? ' class="hl"' : '';
    divs += `<line${hl} x1="${E0 + 10}" y1="${y.toFixed(1)}" x2="${E0 + (big ? 38 : 28)}" y2="${y.toFixed(1)}"/>`;
    if (big) divs += `<text x="${E0 + 44}" y="${(y + 4).toFixed(1)}">${((k % 100) + 100) % 100}</text>`;
  }
  thimbDivs.innerHTML = divs;
  refLine.classList.toggle('hl', state.hint);

  // wire in the gap (practice only)
  const showObj = state.mode === 'practice' && gapPx > 4;
  objWrap.style.display = showObj ? '' : 'none';
  if (showObj) {
    objRect.setAttribute('width', gapPx);
    objRect.setAttribute('rx', Math.min(gapPx / 2, 60));
    objLabel.setAttribute('x', AX + gapPx / 2);
  }

  // magnifier window follows the thimble edge
  magSvg.setAttribute('viewBox', `${(E0 + obsPx - 120).toFixed(1)} 158 190 104`);

  if (state.mode === 'explore') renderReadout();
}

function renderReadout() {
  const R = state.val100 + state.ze100;            // observed reading
  const M = Math.floor(R / 100);                    // main scale, whole mm
  const d = ((R % 100) + 100) % 100;                // circular division on the line
  $('#roMSR').textContent = M + ' mm';
  $('#roCSD').textContent = d;
  $('#roCSR').textContent = (d / 100).toFixed(2) + ' mm';
  $('#roObs').textContent = fmtMm(R) + ' mm';
  const corrRow = $('#rowCorr');
  corrRow.hidden = state.ze100 === 0;
  $('#roCorr').textContent = fmtMm(state.val100) + ' mm';
  const note = $('#zeNote');
  if (R < 0) {
    note.hidden = false;
    note.textContent = '⚠ Circular 0 is past the line — negative zero error in action.';
  } else note.hidden = true;
}

/* ---------------- animation ---------------- */
let animId = 0;
function animateTo(target100, done) {
  cancelAnimationFrame(animId);
  const from = state.view100, d = target100 - from;
  if (Math.abs(d) < 0.01) { state.view100 = target100; update(); if (done) done(); return; }
  const t0 = performance.now(), dur = 600;
  const step = now => {
    const p = clamp((now - t0) / dur, 0, 1);
    const e = 1 - Math.pow(1 - p, 3);
    state.view100 = from + d * e;
    update();
    if (p < 1) animId = requestAnimationFrame(step);
    else { state.view100 = target100; update(); if (done) done(); }
  };
  animId = requestAnimationFrame(step);
}

/* ---------------- dragging ---------------- */
const hit = $('#thimbHit');
let drag = null;

hit.addEventListener('pointerdown', e => {
  if (state.mode !== 'explore') return;
  drag = { startX: e.clientX, start100: state.val100 };
  hit.setPointerCapture(e.pointerId);
  e.preventDefault();
});
hit.addEventListener('pointermove', e => {
  if (!drag) return;
  const scale = svg.getBoundingClientRect().width / 1280;   // px per svg-unit
  const d100 = Math.round((e.clientX - drag.startX) / scale / S * 100);
  cancelAnimationFrame(animId);
  state.val100 = clamp(drag.start100 + d100, 0, MAX100);
  state.view100 = state.val100;
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
  const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 100 : 1);
  cancelAnimationFrame(animId);
  state.val100 = clamp(state.val100 + d, 0, MAX100);
  state.view100 = state.val100;
  update();
});

/* nudge buttons + close gap + zero-error slider */
document.querySelectorAll('.nudge').forEach(b => b.addEventListener('click', () => {
  state.val100 = clamp(state.val100 + Number(b.dataset.d), 0, MAX100);
  animateTo(state.val100);
  renderReadout();
}));
$('#btnCloseJaws').addEventListener('click', () => {
  state.val100 = 0;
  animateTo(0);
  renderReadout();
});
$('#zeSlider').addEventListener('input', e => {
  state.ze100 = Number(e.target.value);
  $('#zeVal').textContent = zeText(state.ze100);
  update();
});

/* ---------------- modes ---------------- */
function setMode(m) {
  state.mode = m;
  document.body.dataset.mode = m;
  $('#tabExplore').classList.toggle('active', m === 'explore');
  $('#tabPractice').classList.toggle('active', m === 'practice');
  $('#tipText').textContent = m === 'explore'
    ? 'Drag the thimble — or use ← → keys (Shift for 1 mm)'
    : 'The spindle is locked on the wire — read the scales carefully';
  if (m === 'practice') {
    if (!state.problem) newProblem();
    else {
      // restore the problem's geometry — explore mode may have moved the spindle
      state.val100 = state.problem.true100;
      state.ze100 = state.problem.ze100;
      syncPhase();
      animateTo(state.phase === 'zero' ? 0 : state.problem.true100);
    }
    renderStats();
  } else {
    state.ze100 = Number($('#zeSlider').value);
    $('#zeVal').textContent = zeText(state.ze100);
    animateTo(state.val100);
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
    const mag = 1 + Math.floor(Math.random() * 7);            // 1..7 (0.01–0.07 mm)
    ze = (Math.random() < 0.5 ? -1 : 1) * mag;
  }
  let t;
  do { t = 150 + Math.floor(Math.random() * 801); }            // 1.50–9.50 mm
  while ((state.problem && t === state.problem.true100) || (t + ze) % 100 === 0);
  // (t + ze) % 100 === 0 is excluded: the mm mark would sit exactly on the
  // thimble edge, which is ambiguous to read.

  state.qCount++;
  state.problem = { true100: t, ze100: ze, num: state.qCount };
  state.val100 = t;
  state.ze100 = ze;
  state.phase = 'measure';
  state.answered = false;
  state.solved = false;

  $('#qNum').textContent = '#' + state.qCount;
  $('#qText').textContent = useZE
    ? 'A wire is clamped between the anvil and the spindle. The gauge may have a zero error — check it, then find the corrected diameter of the wire.'
    : 'A wire is clamped between the anvil and the spindle. Read the scales and find the diameter of the wire.';
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
  animateTo(state.problem.true100);
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
    fb.textContent = 'Enter a number, e.g. 7.37';
    return;
  }
  const correct = Math.abs(v - state.problem.true100 / 100) < 0.005;
  firstAttempt(correct);
  fb.hidden = false;
  if (correct) {
    state.solved = true;
    state.stats.solved++;
    saveStats();
    fb.className = 'feedback ok';
    fb.textContent = `Correct — ${fmtMm(state.problem.true100)} mm 🎉  ${state.stats.streak > 1 ? 'Streak ' + state.stats.streak + '!' : 'Nicely read.'}`;
    inp.disabled = true;
    $('#btnCheck').textContent = 'Next problem →';
  } else {
    fb.className = 'feedback err';
    const hints = state.problem.ze100 !== 0
      ? 'Not quite. Did you subtract the zero error with the right sign?'
      : 'Not quite. Re-check the division on the reference line.';
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
  const { true100, ze100 } = state.problem;
  const obs = true100 + ze100;
  const M = Math.floor(obs / 100);
  const d = ((obs % 100) + 100) % 100;

  let zeStep;
  if (ze100 === 0) {
    zeStep = `Gap closed: circular 0 sits exactly on the reference line → <b>no zero error</b>.`;
  } else if (ze100 > 0) {
    zeStep = `Gap closed: the line reads division <b>${ze100}</b> → ZE = +${ze100} × 0.01 = <b>${signedMm(ze100)} mm</b>.`;
  } else {
    const dz = 100 + ze100;
    zeStep = `Gap closed: the line reads division <b>${dz}</b> → ZE = (${dz} − 100) × 0.01 = <b>${signedMm(ze100)} mm</b>.`;
  }

  const corrStep = ze100 === 0
    ? `<li>Corrected diameter = observed = <b class="sol-final">${fmtMm(true100)} mm</b></li>`
    : `<li>Corrected = observed − ZE = ${fmtMm(obs)} − (${signedMm(ze100)}) = <b class="sol-final">${fmtMm(true100)} mm</b></li>`;

  $('#solutionBox').innerHTML = `<ol>
    <li>Pitch = 1 mm; LC = 1 mm ⁄ 100 = <b>0.01 mm</b></li>
    <li>${zeStep}</li>
    <li>Main scale reading (last visible mark) = <b>${M} mm</b></li>
    <li>Division on the reference line = <b>${d}</b> → ${d} × 0.01 = <b>${(d / 100).toFixed(2)} mm</b></li>
    <li>Observed = ${M} + ${(d / 100).toFixed(2)} = <b>${fmtMm(obs)} mm</b></li>
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
