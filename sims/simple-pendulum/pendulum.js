'use strict';
/* ============================================================
   Simple Pendulum simulation — SimLab
   T = 2π√(L/g) for small-angle oscillations.
   Length in cm, gravity in m/s², time in seconds.
   ============================================================ */

const PX  = 2.6;                       // px per cm
const PIVOT = { x: 600, y: 90 };
const BOB_R = 15;                       // visual bob radius (px)
const MIN_L = 20, MAX_L = 150;         // cm
const GROUND_Y = 520;

const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const TAU = 2 * Math.PI;

function calcT(Lcm, g) { return TAU * Math.sqrt(Lcm / 100 / g); }

/* ---------------- state ---------------- */
const state = {
  mode: 'explore',
  L: 80,              // effective length cm
  g: 9.81,
  gKey: 'earth',
  amp: 15,             // amplitude degrees
  running: false,
  simTime: 0,
  lastFrame: null,
  looping: false,
  animId: 0,
  showTrail: true,
  showRuler: true,

  sw: { elapsed: 0, running: false, startTS: 0 },

  data: [],

  problem: null,
  answered: false,
  solved: false,
  qCount: 0,
  stats: loadStats(),
};

function loadStats() {
  const defaults = { attempts: 0, correct: 0, solved: 0, streak: 0, best: 0 };
  try {
    const s = JSON.parse(localStorage.getItem('simlab-sp-stats'));
    if (s && typeof s.attempts === 'number') return Object.assign(defaults, s);
  } catch (e) { /* fresh */ }
  return defaults;
}
function saveStats() {
  try { localStorage.setItem('simlab-sp-stats', JSON.stringify(state.stats)); } catch (e) {}
}

/* ---------------- build SVG scene ---------------- */
const svg = $('#spSvg');

function buildScene() {
  /* protractor ticks */
  let prot = '';
  const pR = 50;
  for (let d = -25; d <= 25; d += 5) {
    const r = d * Math.PI / 180;
    const big = d % 10 === 0;
    const r1 = 42, r2 = big ? 58 : 52;
    prot += `<line x1="${(PIVOT.x + r1 * Math.sin(r)).toFixed(1)}" y1="${(PIVOT.y + r1 * Math.cos(r)).toFixed(1)}"
                   x2="${(PIVOT.x + r2 * Math.sin(r)).toFixed(1)}" y2="${(PIVOT.y + r2 * Math.cos(r)).toFixed(1)}"
                   stroke="rgba(255,255,255,0.12)" stroke-width="${big ? 1.2 : 0.8}"/>`;
    if (big && d !== 0) {
      const tx = PIVOT.x + (r2 + 12) * Math.sin(r);
      const ty = PIVOT.y + (r2 + 12) * Math.cos(r) + 3;
      prot += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle"
                     fill="rgba(255,255,255,0.15)" font-size="9" font-family="var(--font-mono)">${Math.abs(d)}°</text>`;
    }
  }
  /* protractor arc */
  const lRad = -25 * Math.PI / 180, rRad = 25 * Math.PI / 180;
  prot += `<path d="M ${(PIVOT.x + pR * Math.sin(lRad)).toFixed(1)} ${(PIVOT.y + pR * Math.cos(lRad)).toFixed(1)}
                     A ${pR} ${pR} 0 0 1
                     ${(PIVOT.x + pR * Math.sin(rRad)).toFixed(1)} ${(PIVOT.y + pR * Math.cos(rRad)).toFixed(1)}"
                 fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="0.8"/>`;

  svg.innerHTML = `
  <defs>
    <linearGradient id="steelA" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3f6fc"/>
      <stop offset=".45" stop-color="#cdd6e6"/>
      <stop offset="1" stop-color="#9fabc1"/>
    </linearGradient>
    <linearGradient id="steelB" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e3e9f3"/>
      <stop offset=".5" stop-color="#bcc7da"/>
      <stop offset="1" stop-color="#8e9bb3"/>
    </linearGradient>
    <radialGradient id="bobGrad" cx=".35" cy=".3" r=".65">
      <stop offset="0" stop-color="#ffeaa7"/>
      <stop offset=".4" stop-color="#d4a030"/>
      <stop offset="1" stop-color="#8B6914"/>
    </radialGradient>
    <radialGradient id="shadowGrad" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="rgba(0,0,0,.3)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
    <filter id="spShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="4" stdDeviation="4" flood-color="#000" flood-opacity=".35"/>
    </filter>
  </defs>

  <g id="spScene">
    <!-- support structure -->
    <rect x="520" y="30" width="160" height="18" rx="4" fill="url(#steelA)" stroke="#76829a" stroke-width="1.2"/>
    <rect x="588" y="48" width="24" height="44" rx="3" fill="url(#steelB)" stroke="#76829a" stroke-width="1"/>
    <circle cx="${PIVOT.x}" cy="${PIVOT.y}" r="5" fill="url(#steelA)" stroke="#76829a" stroke-width="1.2"/>

    <!-- protractor -->
    <g class="protractor">${prot}</g>

    <!-- equilibrium line -->
    <line id="eqLine" x1="${PIVOT.x}" y1="${PIVOT.y + 10}" x2="${PIVOT.x}" y2="${GROUND_Y}" class="eq-line"/>

    <!-- ground -->
    <line x1="200" y1="${GROUND_Y}" x2="1000" y2="${GROUND_Y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>

    <!-- trail arc (dynamic) -->
    <path id="trailArc" d="" class="trail-arc"/>

    <!-- length indicator (dynamic) -->
    <g id="lenGroup"></g>

    <!-- angle arc (dynamic) -->
    <g id="angleGroup"></g>

    <!-- string -->
    <line id="string" x1="${PIVOT.x}" y1="${PIVOT.y}" x2="${PIVOT.x}" y2="${PIVOT.y + state.L * PX}" stroke="#c4a882" stroke-width="2" stroke-linecap="round"/>

    <!-- bob shadow -->
    <ellipse id="bobShadow" cx="${PIVOT.x}" cy="${GROUND_Y}" rx="18" ry="5" fill="url(#shadowGrad)"/>

    <!-- bob -->
    <circle id="bob" cx="${PIVOT.x}" cy="${PIVOT.y + state.L * PX}" r="${BOB_R}" fill="url(#bobGrad)" stroke="#8B6914" stroke-width="1.5" filter="url(#spShadow)"/>

    <!-- branding -->
    <text x="600" y="${GROUND_Y + 28}" text-anchor="middle" class="brand-text">SIMLAB · SIMPLE PENDULUM · T = 2π√(L ⁄ g)</text>
  </g>`;
}
buildScene();

/* element refs */
const stringEl  = $('#string');
const bobEl     = $('#bob');
const bobShadow = $('#bobShadow');
const trailArc  = $('#trailArc');
const angleGroup = $('#angleGroup');
const lenGroup  = $('#lenGroup');

/* ---------------- core rendering ---------------- */
function getAngle() {
  const ampRad = state.amp * Math.PI / 180;
  if (!state.running && state.simTime === 0) return ampRad;
  const T = calcT(state.L, state.g);
  return ampRad * Math.cos(TAU * state.simTime / T);
}

function update() {
  const theta = getAngle();
  const Lpx = state.L * PX;

  /* bob position */
  const bx = PIVOT.x + Lpx * Math.sin(theta);
  const by = PIVOT.y + Lpx * Math.cos(theta);

  stringEl.setAttribute('x2', bx.toFixed(1));
  stringEl.setAttribute('y2', by.toFixed(1));
  bobEl.setAttribute('cx', bx.toFixed(1));
  bobEl.setAttribute('cy', by.toFixed(1));

  /* shadow */
  const hFrac = clamp((GROUND_Y - by) / (GROUND_Y - PIVOT.y), 0, 1);
  const ss = 1 - hFrac * 0.5;
  bobShadow.setAttribute('cx', bx.toFixed(1));
  bobShadow.setAttribute('rx', (18 * ss).toFixed(1));
  bobShadow.setAttribute('ry', (5 * ss).toFixed(1));
  bobShadow.setAttribute('opacity', (0.6 * ss).toFixed(2));

  /* trail arc */
  if (state.showTrail) {
    const a = state.amp * Math.PI / 180;
    const lx = PIVOT.x - Lpx * Math.sin(a);
    const ly = PIVOT.y + Lpx * Math.cos(a);
    const rx = PIVOT.x + Lpx * Math.sin(a);
    const ry = PIVOT.y + Lpx * Math.cos(a);
    trailArc.setAttribute('d', `M ${lx.toFixed(1)} ${ly.toFixed(1)} A ${Lpx} ${Lpx} 0 0 1 ${rx.toFixed(1)} ${ry.toFixed(1)}`);
    trailArc.style.display = '';
  } else trailArc.style.display = 'none';

  /* angle arc */
  if (Math.abs(theta) > 0.005) {
    const ar = Math.min(60, Lpx * 0.25);
    const sx = PIVOT.x, sy = PIVOT.y + ar;
    const ex = PIVOT.x + ar * Math.sin(theta);
    const ey = PIVOT.y + ar * Math.cos(theta);
    const sweep = theta > 0 ? 1 : 0;
    const deg = Math.abs(theta * 180 / Math.PI).toFixed(1);
    const lx = PIVOT.x + (ar + 16) * Math.sin(theta / 2);
    const ly = PIVOT.y + (ar + 16) * Math.cos(theta / 2) + 4;
    angleGroup.innerHTML = `
      <path d="M ${sx} ${sy} A ${ar} ${ar} 0 0 ${sweep} ${ex.toFixed(1)} ${ey.toFixed(1)}" class="angle-arc"/>
      <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" class="angle-text">${deg}°</text>`;
  } else angleGroup.innerHTML = '';

  /* length indicator */
  if (state.showRuler) {
    const off = 35;
    const top = PIVOT.y, bot = PIVOT.y + Lpx;
    const displayL = (state.mode === 'practice' && state.problem && state.problem.useBob)
      ? state.problem.L : state.L;
    const label = (state.mode === 'practice' && state.problem && state.problem.useBob)
      ? `${displayL} cm*` : `${displayL} cm`;
    lenGroup.innerHTML = `
      <line x1="${PIVOT.x + off}" y1="${top}" x2="${PIVOT.x + off}" y2="${bot}" class="len-line"/>
      <line x1="${PIVOT.x + off - 5}" y1="${top}" x2="${PIVOT.x + off + 5}" y2="${top}" class="len-tick"/>
      <line x1="${PIVOT.x + off - 5}" y1="${bot}" x2="${PIVOT.x + off + 5}" y2="${bot}" class="len-tick"/>
      <text x="${PIVOT.x + off + 4}" y="${((top + bot) / 2 + 4).toFixed(1)}" class="len-text">${label}</text>`;
    lenGroup.style.display = '';
  } else lenGroup.style.display = 'none';

  if (state.mode === 'explore') renderReadout();
}

function renderReadout() {
  const T = calcT(state.L, state.g);
  const theta = getAngle();
  $('#roL').textContent     = state.L + ' cm';
  $('#roG').textContent     = state.g.toFixed(2) + ' m/s²';
  $('#roT').textContent     = T.toFixed(4) + ' s';
  $('#roF').textContent     = (1 / T).toFixed(4) + ' Hz';
  $('#roAngle').textContent = (theta * 180 / Math.PI).toFixed(1) + '°';
}

/* ---------------- animation loop ---------------- */
function animate(ts) {
  if (state.lastFrame === null) state.lastFrame = ts;
  const dt = Math.min((ts - state.lastFrame) / 1000, 0.05);
  state.lastFrame = ts;

  if (state.running) state.simTime += dt;
  update();
  updateSwDisplay();

  if (state.looping) state.animId = requestAnimationFrame(animate);
}

function startLoop() {
  if (!state.looping) {
    state.looping = true;
    state.lastFrame = null;
    state.animId = requestAnimationFrame(animate);
  }
}
function stopLoop() {
  if (state.looping && !state.running && !state.sw.running) {
    state.looping = false;
    cancelAnimationFrame(state.animId);
  }
}

function startPendulum() {
  state.running = true;
  $('#btnPlay').textContent = '⏸ Pause';
  startLoop();
}
function stopPendulum() {
  state.running = false;
  $('#btnPlay').textContent = '▶ Start';
  stopLoop();
}
function resetPendulum() {
  state.running = false;
  state.simTime = 0;
  state.lastFrame = null;
  $('#btnPlay').textContent = '▶ Start';
  update();
  stopLoop();
}
function togglePendulum() { state.running ? stopPendulum() : startPendulum(); }

/* ---------------- stopwatch ---------------- */
function getSwElapsed() {
  return state.sw.running
    ? state.sw.elapsed + (performance.now() - state.sw.startTS) / 1000
    : state.sw.elapsed;
}
function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const w = Math.floor(sec);
  const cs = Math.floor((sec - w) * 100);
  return `${String(m).padStart(2, '0')}:${String(w).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
function updateSwDisplay() {
  $('#swDisplay').textContent = fmtTime(getSwElapsed());
}
function toggleSW() {
  if (state.sw.running) {
    state.sw.elapsed += (performance.now() - state.sw.startTS) / 1000;
    state.sw.running = false;
    $('#btnSW').textContent = 'Start';
    updateSwDisplay();
    stopLoop();
  } else {
    state.sw.running = true;
    state.sw.startTS = performance.now();
    $('#btnSW').textContent = 'Stop';
    startLoop();
  }
}
function resetSW() {
  state.sw.elapsed = 0;
  state.sw.running = false;
  state.sw.startTS = 0;
  $('#btnSW').textContent = 'Start';
  updateSwDisplay();
}

$('#btnSW').addEventListener('click', toggleSW);
$('#btnSWReset').addEventListener('click', resetSW);

/* ---------------- explore controls ---------------- */
$('#lSlider').addEventListener('input', e => {
  state.L = Number(e.target.value);
  $('#lVal').textContent = state.L + ' cm';
  resetPendulum(); update();
});

$('#aSlider').addEventListener('input', e => {
  state.amp = Number(e.target.value);
  $('#aVal').textContent = state.amp + '°';
  resetPendulum(); update();
});

const G_MAP = { earth: 9.81, moon: 1.62, mars: 3.72, jupiter: 24.79 };
document.querySelectorAll('.grav-btn').forEach(b => b.addEventListener('click', () => {
  state.g = G_MAP[b.dataset.g];
  state.gKey = b.dataset.g;
  document.querySelectorAll('.grav-btn').forEach(x => x.classList.toggle('active', x === b));
  resetPendulum(); update();
}));

$('#btnPlay').addEventListener('click', togglePendulum);
$('#btnReset').addEventListener('click', resetPendulum);

/* ---------------- stage toggles ---------------- */
$('#btnTrail').addEventListener('click', e => {
  state.showTrail = !state.showTrail;
  e.currentTarget.classList.toggle('active', state.showTrail);
  update();
});
$('#btnRuler').addEventListener('click', e => {
  state.showRuler = !state.showRuler;
  e.currentTarget.classList.toggle('active', state.showRuler);
  update();
});

/* ---------------- data collection (explore) ---------------- */
$('#btnRecord').addEventListener('click', () => {
  state.data.push({ L: state.L, T: calcT(state.L, state.g), g: state.g });
  renderDataTable(); renderChart();
});
$('#btnClearData').addEventListener('click', () => {
  state.data = [];
  renderDataTable(); renderChart();
});

function renderDataTable() {
  const tb = $('#dataBody');
  if (!state.data.length) {
    tb.innerHTML = '<tr><td colspan="4" class="data-empty">No data yet — press Record</td></tr>';
    return;
  }
  tb.innerHTML = state.data.map((d, i) =>
    `<tr><td>${i + 1}</td><td>${d.L}</td><td>${d.T.toFixed(3)}</td><td>${(d.T * d.T).toFixed(3)}</td></tr>`
  ).join('');
}

function renderChart() {
  const cs = $('#chartSvg');
  if (!state.data.length) {
    cs.innerHTML = '<text x="120" y="70" text-anchor="middle" fill="rgba(255,255,255,0.2)" font-size="11" font-family="var(--font-mono)">Record data to see graph</text>';
    return;
  }
  const W = 240, H = 130, p = { l: 38, r: 8, t: 8, b: 22 };
  const pw = W - p.l - p.r, ph = H - p.t - p.b;
  const mxL = Math.max(160, ...state.data.map(d => d.L)) * 1.1;
  const mxT2 = Math.max(...state.data.map(d => d.T * d.T)) * 1.3;

  let s = '';
  /* axes */
  s += `<line x1="${p.l}" y1="${H - p.b}" x2="${W - p.r}" y2="${H - p.b}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`;
  s += `<line x1="${p.l}" y1="${p.t}" x2="${p.l}" y2="${H - p.b}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`;
  s += `<text x="${(p.l + W - p.r) / 2}" y="${H - 2}" text-anchor="middle" fill="rgba(255,255,255,0.25)" font-size="8" font-family="var(--font-mono)">L (cm)</text>`;
  s += `<text x="10" y="${(p.t + H - p.b) / 2}" text-anchor="middle" fill="rgba(255,255,255,0.25)" font-size="8" font-family="var(--font-mono)" transform="rotate(-90 10 ${(p.t + H - p.b) / 2})">T² (s²)</text>`;

  /* theoretical line T² = 4π²L/(100g) */
  const slope = 4 * Math.PI * Math.PI / (100 * state.g);
  const endL = mxL;
  const endT2 = slope * endL;
  const lx1 = p.l, ly1 = H - p.b;
  const lx2 = p.l + (endL / mxL) * pw;
  const ly2 = H - p.b - Math.min((endT2 / mxT2) * ph, ph);
  s += `<line x1="${lx1}" y1="${ly1}" x2="${lx2.toFixed(1)}" y2="${ly2.toFixed(1)}" stroke="rgba(99,179,237,0.25)" stroke-width="1" stroke-dasharray="4 3"/>`;

  /* data points */
  state.data.forEach(d => {
    const x = p.l + (d.L / mxL) * pw;
    const y = H - p.b - ((d.T * d.T) / mxT2) * ph;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#63b3ed" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>`;
  });
  cs.innerHTML = s;
}

/* ---------------- modes ---------------- */
function setMode(m) {
  state.mode = m;
  document.body.dataset.mode = m;
  $('#tabExplore').classList.toggle('active', m === 'explore');
  $('#tabPractice').classList.toggle('active', m === 'practice');
  $('#tipText').textContent = m === 'explore'
    ? 'Adjust the length and press Start — or use the stopwatch to time oscillations'
    : 'Calculate the time period from the given length — use the stopwatch to verify';

  if (m === 'practice') {
    if (!state.problem) newProblem();
    else {
      state.L = state.problem.Leff;
      state.g = state.problem.g;
      state.amp = 12;
      resetPendulum(); startPendulum();
    }
    renderStats();
  } else {
    state.L = Number($('#lSlider').value);
    state.amp = Number($('#aSlider').value);
    const ab = document.querySelector('.grav-btn.active');
    if (ab) state.g = G_MAP[ab.dataset.g] || 9.81;
    resetPendulum(); resetSW();
  }
  update();
}
$('#tabExplore').addEventListener('click', () => setMode('explore'));
$('#tabPractice').addEventListener('click', () => setMode('practice'));

/* ---------------- practice ---------------- */
function newProblem() {
  const useBob = $('#chkBob').checked;
  const g = 9.81;
  let L, r, Leff;

  if (useBob) {
    do {
      L = 30 + Math.floor(Math.random() * 91);           // 30-120 cm
      r = 2 + Math.floor(Math.random() * 7) * 0.5;       // 2.0-5.0 cm
      Leff = L - r;
    } while (
      Leff < 20 ||
      (state.problem && L === state.problem.L && r === state.problem.bobR) ||
      Math.abs(calcT(L, g) - calcT(Leff, g)) < 0.03
    );
  } else {
    do { L = 25 + Math.floor(Math.random() * 116); }     // 25-140 cm
    while (state.problem && L === state.problem.L);
    r = 0; Leff = L;
  }

  const T = calcT(Leff, g);

  state.qCount++;
  state.problem = { L, Leff, bobR: r, g, T, num: state.qCount, useBob };
  state.L = Leff;
  state.g = g;
  state.amp = 12;
  state.answered = false;
  state.solved = false;

  $('#qNum').textContent = '#' + state.qCount;
  $('#qText').textContent = useBob
    ? `A pendulum of length ${L} cm (pivot to bottom of the bob, radius ${r} cm) oscillates freely. Find the corrected time period. (g = ${g} m/s²)`
    : `A simple pendulum of length ${L} cm oscillates freely. Calculate its time period. (g = ${g} m/s²)`;

  const inp = $('#ansInput');
  inp.value = ''; inp.disabled = false;
  $('#btnCheck').textContent = 'Check';
  $('#feedback').hidden = true;
  $('#solutionBox').hidden = true;

  resetSW(); resetPendulum(); startPendulum();
  renderStats(); update();
}

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
  const v = parseFloat($('#ansInput').value);
  const fb = $('#feedback');
  if (Number.isNaN(v)) {
    fb.hidden = false; fb.className = 'feedback warn';
    fb.textContent = 'Enter a number, e.g. 1.79'; return;
  }
  const correct = Math.abs(v - state.problem.T) < 0.02;
  firstAttempt(correct);
  fb.hidden = false;
  if (correct) {
    state.solved = true;
    state.stats.solved++; saveStats();
    fb.className = 'feedback ok';
    fb.textContent = `Correct — ${state.problem.T.toFixed(2)} s 🎉  ${state.stats.streak > 1 ? 'Streak ' + state.stats.streak + '!' : 'Well calculated.'}`;
    $('#ansInput').disabled = true;
    $('#btnCheck').textContent = 'Next problem →';
  } else {
    fb.className = 'feedback err';
    fb.textContent = (state.problem.useBob
      ? 'Not quite. Did you correct the length for the bob radius?'
      : 'Not quite — check your calculation: T = 2π√(L/g).') + ' Try again.';
    const field = $('#ansInput').closest('.ans-field');
    field.classList.remove('shake'); void field.offsetWidth;
    field.classList.add('shake');
  }
  renderStats();
}

$('#btnCheck').addEventListener('click', check);
$('#ansInput').addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
$('#btnNew').addEventListener('click', newProblem);
$('#chkBob').addEventListener('change', newProblem);

/* solution steps */
$('#btnSolution').addEventListener('click', () => {
  if (!state.solved && !state.answered) {
    state.answered = true;
    state.stats.attempts++;
    state.stats.streak = 0;
    saveStats(); renderStats();
  }
  const p = state.problem;
  const Lm = (p.Leff / 100).toFixed(4);
  const sqr = Math.sqrt(p.Leff / 100 / p.g).toFixed(4);

  let html;
  if (p.useBob) {
    html = `<ol>
      <li>Measured length (to bottom of bob) = <b>${p.L} cm</b></li>
      <li>Bob radius = <b>${p.bobR} cm</b></li>
      <li>Effective length L = ${p.L} − ${p.bobR} = <b>${p.Leff} cm</b> = ${Lm} m</li>
      <li>g = <b>${p.g} m/s²</b></li>
      <li>T = 2π√(L/g) = 2π√(${Lm} / ${p.g}) = 2π × ${sqr}</li>
      <li>T = <b class="sol-final">${p.T.toFixed(4)} ≈ ${p.T.toFixed(2)} s</b></li>
    </ol>`;
  } else {
    html = `<ol>
      <li>L = <b>${p.L} cm</b> = ${Lm} m</li>
      <li>g = <b>${p.g} m/s²</b></li>
      <li>T = 2π√(L/g) = 2π√(${Lm} / ${p.g}) = 2π × ${sqr}</li>
      <li>T = <b class="sol-final">${p.T.toFixed(4)} ≈ ${p.T.toFixed(2)} s</b></li>
    </ol>`;
  }
  $('#solutionBox').innerHTML = html;
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

/* help dialog */
$('#btnHelp').addEventListener('click', () => $('#helpDlg').showModal());
$('#btnHelpClose').addEventListener('click', () => $('#helpDlg').close());
$('#helpDlg').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.close();
});

/* ---------------- init ---------------- */
renderStats();
renderDataTable();
renderChart();
update();
