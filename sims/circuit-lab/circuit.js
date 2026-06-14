(() => {
'use strict';

const CELL = 40, COLS = 24, ROWS = 14;
const $ = id => document.getElementById(id);
const SVG = $('circSvg');
const SUBS = '₁₂₃₄₅₆₇₈₉';
const DEFAULTS = {
  battery: { value: 9 },
  resistor: { value: 100 },
  bulb: { value: 50 },
  switch: { value: 0 },
  led: { value: 20 },
  motor: { value: 40 },
};

let nextId = 1;
const state = {
  mode: 'explore',
  tool: 'select',
  rot: 0,
  comps: [],
  wires: [],
  sel: null,
  wiringFrom: null,
  mouseG: null,
  hoverTerm: null,
  analysis: null,
  problem: null,
  answered: false,
  solved: false,
  qCount: 0,
  stats: loadStats(),
};

function pt(gx, gy) { return gx + ',' + gy; }

function getTerminals(c) {
  if (c.rot === 90) return [{ gx: c.x, gy: c.y - 1 }, { gx: c.x, gy: c.y + 1 }];
  return [{ gx: c.x - 1, gy: c.y }, { gx: c.x + 1, gy: c.y }];
}

function fmtR(r) { return r >= 1000 ? (r / 1000) + 'kΩ' : r + 'Ω'; }
function fmtI(a) {
  if (a < 0.001) return (a * 1e6).toFixed(0) + ' μA';
  if (a < 1) return (a * 1000).toFixed(1) + ' mA';
  return a.toFixed(2) + ' A';
}
function fmtP(p) { return p < 0.01 ? (p * 1000).toFixed(1) + ' mW' : p.toFixed(2) + ' W'; }

function svgPt(e) {
  const r = SVG.getBoundingClientRect(), vb = SVG.viewBox.baseVal;
  return { x: (e.clientX - r.left) / r.width * vb.width, y: (e.clientY - r.top) / r.height * vb.height };
}

function snapGrid(p) {
  return { gx: Math.max(0, Math.min(COLS, Math.round(p.x / CELL))),
           gy: Math.max(0, Math.min(ROWS, Math.round(p.y / CELL))) };
}

function autoLabel(type) {
  const pre = { resistor: 'R', bulb: 'L', led: 'D', motor: 'M' }[type] || '';
  if (!pre) return '';
  const used = new Set(state.comps.filter(c => c.type === type).map(c => c.label));
  for (let n = 1; n <= 20; n++) {
    const lbl = pre + (n <= 9 ? SUBS[n - 1] : String(n));
    if (!used.has(lbl)) return lbl;
  }
  return pre + (state.comps.length + 1);
}

function findTermAt(gx, gy, comps) {
  const list = comps || state.comps;
  for (const c of list) {
    for (const t of getTerminals(c)) {
      if (t.gx === gx && t.gy === gy) return t;
    }
  }
  return null;
}

function findCompAt(gx, gy) {
  return state.comps.find(c => {
    if (c.rot === 90) return c.x === gx && Math.abs(c.y - gy) <= 1;
    return c.y === gy && Math.abs(c.x - gx) <= 1;
  });
}

function canPlace(gx, gy, rot) {
  if (rot === 90) {
    if (gy < 1 || gy > ROWS - 1 || gx < 0 || gx > COLS) return false;
  } else {
    if (gx < 1 || gx > COLS - 1 || gy < 0 || gy > ROWS) return false;
  }
  const cells = rot === 90
    ? [pt(gx, gy - 1), pt(gx, gy), pt(gx, gy + 1)]
    : [pt(gx - 1, gy), pt(gx, gy), pt(gx + 1, gy)];
  return !state.comps.some(c => {
    const cc = c.rot === 90
      ? [pt(c.x, c.y - 1), pt(c.x, c.y), pt(c.x, c.y + 1)]
      : [pt(c.x - 1, c.y), pt(c.x, c.y), pt(c.x + 1, c.y)];
    return cells.some(a => cc.includes(a));
  });
}

function removeWiresFor(c) {
  const tKeys = new Set(getTerminals(c).map(t => pt(t.gx, t.gy)));
  state.wires = state.wires.filter(w => !w.some(p => tKeys.has(pt(p.gx, p.gy))));
}

class UF {
  constructor() { this.p = {}; this.r = {}; }
  mk(k) { if (!(k in this.p)) { this.p[k] = k; this.r[k] = 0; } }
  find(k) { this.mk(k); return this.p[k] === k ? k : (this.p[k] = this.find(this.p[k])); }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return;
    if (this.r[ra] < this.r[rb]) this.p[ra] = rb;
    else if (this.r[ra] > this.r[rb]) this.p[rb] = ra;
    else { this.p[rb] = ra; this.r[ra]++; }
  }
}

function solveLinear(A, b) {
  const n = A.length;
  if (!n) return [];
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let best = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[best][col])) best = r;
    if (Math.abs(M[best][col]) < 1e-12) return null;
    [M[col], M[best]] = [M[best], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i];
  }
  return x;
}

function buildGrid() {
  let s = '';
  for (let x = 0; x <= COLS; x++)
    for (let y = 0; y <= ROWS; y++)
      s += `<circle cx="${x * CELL}" cy="${y * CELL}" r="1.5" class="gdot"/>`;
  return s;
}

function battSvg(c) {
  return `<line x1="-${CELL}" y1="0" x2="-12" y2="0" class="lead"/>
<line x1="12" y1="0" x2="${CELL}" y2="0" class="lead"/>
<rect x="-14" y="-18" width="28" height="36" rx="4" class="batt-body"/>
<line x1="-8" y1="-13" x2="-8" y2="13" class="batt-p"/>
<line x1="-2" y1="-7" x2="-2" y2="7" class="batt-n"/>
<line x1="4" y1="-13" x2="4" y2="13" class="batt-p"/>
<line x1="10" y1="-7" x2="10" y2="7" class="batt-n"/>
<text x="-20" y="-12" class="pol pn">−</text>
<text x="16" y="-12" class="pol pp">+</text>
<text x="0" y="32" text-anchor="middle" class="clbl">${c.value}V</text>`;
}

function resSvg(c) {
  return `<line x1="-${CELL}" y1="0" x2="-20" y2="0" class="lead"/>
<line x1="20" y1="0" x2="${CELL}" y2="0" class="lead"/>
<rect x="-20" y="-10" width="40" height="20" rx="3.5" fill="url(#resG)" stroke="#8a7a66" stroke-width="1"/>
<text x="0" y="4" text-anchor="middle" class="rtxt">${fmtR(c.value)}</text>
<text x="0" y="32" text-anchor="middle" class="clbl">${c.label}</text>`;
}

function bulbSvg(c) {
  const glow = glowLevel(c);
  return `<line x1="-${CELL}" y1="0" x2="-15" y2="0" class="lead"/>
<line x1="15" y1="0" x2="${CELL}" y2="0" class="lead"/>
<circle cx="0" cy="0" r="15" fill="url(#bulbG)" stroke="#8a96aa" stroke-width="1.2"/>
<path d="M-7-7 7 7M-7 7 7-7" class="filament"/>
${glow > 0 ? `<circle cx="0" cy="0" r="24" fill="url(#glowG)" opacity="${glow.toFixed(2)}"/>` : ''}
<text x="0" y="32" text-anchor="middle" class="clbl">${c.label || ''}</text>`;
}

function swSvg(c) {
  const on = c.state === 'closed';
  return `<line x1="-${CELL}" y1="0" x2="-14" y2="0" class="lead"/>
<line x1="14" y1="0" x2="${CELL}" y2="0" class="lead"/>
<circle cx="-14" cy="0" r="4.5" class="sw-dot"/>
<circle cx="14" cy="0" r="4.5" class="sw-dot"/>
<line x1="-14" y1="0" x2="14" y2="${on ? 0 : -20}" class="sw-arm"/>
<text x="0" y="32" text-anchor="middle" class="clbl">${on ? 'ON' : 'OFF'}</text>`;
}

function ledSvg(c) {
  const col = c.color || '#ef4444';
  const glow = glowLevel(c);
  return `<line x1="-${CELL}" y1="0" x2="-10" y2="0" class="lead"/>
<line x1="10" y1="0" x2="${CELL}" y2="0" class="lead"/>
<polygon points="-8,-12 10,0 -8,12" fill="${col}" fill-opacity="0.82" stroke="rgba(255,255,255,0.2)" stroke-width="0.8"/>
<line x1="10" y1="-13" x2="10" y2="13" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>
<line x1="5" y1="-14" x2="10" y2="-21" class="led-ray" stroke="${col}" stroke-width="1.3" stroke-linecap="round"/>
<polygon points="8,-18.5 10,-21 7.5,-19.5" fill="${col}"/>
<line x1="10" y1="-16" x2="15" y2="-23" class="led-ray" stroke="${col}" stroke-width="1.3" stroke-linecap="round"/>
<polygon points="13,-20.5 15,-23 12.5,-21.5" fill="${col}"/>
${glow > 0 ? `<circle cx="0" cy="0" r="24" fill="${col}" opacity="${(glow * 0.4).toFixed(2)}"/>` : ''}
<text x="0" y="32" text-anchor="middle" class="clbl">${c.label || ''}</text>`;
}

function motorSvg(c) {
  const spinning = glowLevel(c) > 0;
  return `<line x1="-${CELL}" y1="0" x2="-16" y2="0" class="lead"/>
<line x1="16" y1="0" x2="${CELL}" y2="0" class="lead"/>
<circle cx="0" cy="0" r="16" fill="url(#bulbG)" stroke="#8a96aa" stroke-width="1.5"/>
<text x="0" y="5.5" text-anchor="middle" class="motor-m">M</text>
${spinning ? `<circle cx="0" cy="0" r="10" fill="none" stroke="var(--acc)" stroke-width="1.5" stroke-dasharray="5 4" class="motor-spin"/>` : ''}
<text x="0" y="32" text-anchor="middle" class="clbl">${c.label || ''}</text>`;
}

function glowLevel(c) {
  const a = state.analysis;
  if (!a || !a.components || !a.components[c.id]) return 0;
  return Math.min(a.components[c.id].P / 2.5, 1);
}

function renderComp(c) {
  const px = c.x * CELL, py = c.y * CELL;
  const rot = c.rot || 0;
  let inner = '';
  if (c.id === state.sel) inner += `<rect x="-${CELL + 6}" y="-28" width="${(CELL + 6) * 2}" height="56" rx="10" class="sel-box"/>`;
  switch (c.type) {
    case 'battery': inner += battSvg(c); break;
    case 'resistor': inner += resSvg(c); break;
    case 'bulb': inner += bulbSvg(c); break;
    case 'switch': inner += swSvg(c); break;
    case 'led': inner += ledSvg(c); break;
    case 'motor': inner += motorSvg(c); break;
  }
  inner += `<circle cx="-${CELL}" cy="0" r="5" class="term"/>`;
  inner += `<circle cx="${CELL}" cy="0" r="5" class="term"/>`;
  return `<g class="comp" data-id="${c.id}" transform="translate(${px},${py})${rot ? ` rotate(${rot})` : ''}" filter="url(#compSh)">${inner}</g>`;
}

function renderWire(w) {
  const pts = w.map(p => `${p.gx * CELL},${p.gy * CELL}`).join(' ');
  const live = state.mode === 'practice' || (state.analysis && state.analysis.total && state.analysis.total.I > 0.0001);
  return `<polyline points="${pts}" class="wire${live ? ' wire-live' : ''}"/>`;
}

function renderJunctions(comps, wires) {
  const count = {};
  const inc = k => { count[k] = (count[k] || 0) + 1; };
  wires.forEach(w => w.forEach(p => inc(pt(p.gx, p.gy))));
  comps.forEach(c => getTerminals(c).forEach(t => inc(pt(t.gx, t.gy))));
  let s = '';
  for (const [k, n] of Object.entries(count)) {
    if (n >= 3) {
      const [gx, gy] = k.split(',').map(Number);
      s += `<circle cx="${gx * CELL}" cy="${gy * CELL}" r="4.5" class="junc"/>`;
    }
  }
  return s;
}

function buildOverlay() {
  if (state.mode === 'practice') return '';
  let s = '';
  const mg = state.mouseG;
  if (!mg) return s;
  if (state.hoverTerm) {
    s += `<circle cx="${state.hoverTerm.gx * CELL}" cy="${state.hoverTerm.gy * CELL}" r="10" class="term-glow"/>`;
  }
  if (state.wiringFrom && mg) {
    const f = state.wiringFrom;
    let pts = `${f.gx * CELL},${f.gy * CELL} `;
    if (f.gx !== mg.gx && f.gy !== mg.gy) pts += `${mg.gx * CELL},${f.gy * CELL} `;
    pts += `${mg.gx * CELL},${mg.gy * CELL}`;
    s += `<polyline points="${pts}" class="wire-preview"/>`;
  }
  const tool = state.tool;
  if (DEFAULTS[tool] && mg) {
    const ok = canPlace(mg.gx, mg.gy, state.rot);
    if (ok) {
      const ghost = { id: '__g__', type: tool, x: mg.gx, y: mg.gy, rot: state.rot,
        value: DEFAULTS[tool].value, state: tool === 'switch' ? 'open' : null,
        color: tool === 'led' ? '#ef4444' : undefined, label: '' };
      const raw = renderComp(ghost).replace(/filter="[^"]*"/g, '');
      s += `<g class="ghost">${raw}</g>`;
    }
  }
  return s;
}

function activeCircuit() {
  if (state.mode === 'practice' && state.problem) return { comps: state.problem.comps, wires: state.problem.wires };
  return { comps: state.comps, wires: state.wires };
}

function renderAll() {
  const { comps, wires } = activeCircuit();
  let wHtml = wires.map(w => renderWire(w)).join('') + renderJunctions(comps, wires);
  let cHtml = comps.map(c => renderComp(c)).join('');
  if (state.mode === 'practice' && state.problem) {
    const p = state.problem;
    cHtml += `<text x="480" y="26" text-anchor="middle" class="circ-type">${p.type === 'series' ? 'SERIES CIRCUIT' : 'PARALLEL CIRCUIT'}</text>`;
    cHtml += `<text x="480" y="${ROWS * CELL - 6}" text-anchor="middle" class="brand-txt">SimLab \xb7 Circuit Lab</text>`;
  }
  $('wireG').innerHTML = wHtml;
  $('compG').innerHTML = cHtml;
  updateOverlay();
}

function updateOverlay() { $('overG').innerHTML = buildOverlay(); }

function onSvgClick(e) {
  if (state.mode === 'practice') return;
  const g = snapGrid(svgPt(e));
  const tool = state.tool;

  if (tool === 'wire') {
    const term = findTermAt(g.gx, g.gy);
    if (state.wiringFrom) {
      if (term && !(term.gx === state.wiringFrom.gx && term.gy === state.wiringFrom.gy)) {
        const f = state.wiringFrom;
        const pts = [{ gx: f.gx, gy: f.gy }];
        if (f.gx !== term.gx && f.gy !== term.gy) pts.push({ gx: term.gx, gy: f.gy });
        pts.push({ gx: term.gx, gy: term.gy });
        state.wires.push(pts);
        state.wiringFrom = null;
        analyze(); renderAll();
        setTip('Wire placed — click another terminal to start a new wire');
      }
    } else if (term) {
      state.wiringFrom = { gx: term.gx, gy: term.gy };
      setTip('Click another terminal to complete the wire — Escape to cancel');
    }
    return;
  }

  if (tool === 'select') {
    const comp = findCompAt(g.gx, g.gy);
    if (comp) {
      if (comp.type === 'switch') {
        comp.state = comp.state === 'closed' ? 'open' : 'closed';
        analyze(); renderAll();
        return;
      }
      state.sel = comp.id;
    } else {
      state.sel = null;
    }
    updateProps(); renderAll();
    return;
  }

  if (DEFAULTS[tool] && canPlace(g.gx, g.gy, state.rot)) {
    const id = 'c' + (nextId++);
    state.comps.push({
      id, type: tool, x: g.gx, y: g.gy, rot: state.rot,
      value: DEFAULTS[tool].value,
      state: tool === 'switch' ? 'open' : null,
      color: tool === 'led' ? '#ef4444' : undefined,
      label: autoLabel(tool),
    });
    state.sel = id;
    updateProps(); analyze(); renderAll();
  }
}

function onSvgMove(e) {
  if (state.mode === 'practice') return;
  state.mouseG = snapGrid(svgPt(e));
  state.hoverTerm = findTermAt(state.mouseG.gx, state.mouseG.gy);
  updateOverlay();
}

function onKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (state.mode === 'practice') return;
  switch (e.key) {
    case 'Escape':
      state.wiringFrom = null; state.sel = null;
      updateProps(); renderAll();
      setTip('Pick a component from the toolbar, then click the grid to place it');
      break;
    case 'Delete': case 'Backspace':
      if (state.sel) {
        const c = state.comps.find(x => x.id === state.sel);
        if (c) { state.comps = state.comps.filter(x => x.id !== state.sel); removeWiresFor(c); }
        state.sel = null;
        updateProps(); analyze(); renderAll();
      }
      break;
    case 'r':
      if (!e.ctrlKey && !e.metaKey) {
        state.rot = state.rot === 0 ? 90 : 0;
        $('btnRotate').textContent = state.rot + '\xb0';
        updateOverlay();
      }
      break;
    case 's': setTool('select'); break;
    case 'w': setTool('wire'); break;
    case 'b': setTool('battery'); break;
    case 'e': setTool('resistor'); break;
    case 'l': setTool('bulb'); break;
    case 'k': setTool('switch'); break;
    case 'd': setTool('led'); break;
    case 'm': setTool('motor'); break;
  }
}

function analyze() {
  if (state.mode === 'practice') return;
  const comps = state.comps;
  const wires = state.wires;

  const batts = comps.filter(c => c.type === 'battery');
  if (batts.length === 0) { state.analysis = null; updateAnalysis(); return; }
  if (batts.length > 1) { state.analysis = { error: 'Only one battery supported' }; updateAnalysis(); return; }
  const batt = batts[0];

  const resistive = comps.filter(c => c.type === 'resistor' || c.type === 'bulb' || c.type === 'led' || c.type === 'motor');
  if (!resistive.length) { state.analysis = null; updateAnalysis(); return; }

  const uf = new UF();
  comps.forEach(c => {
    const t = getTerminals(c);
    uf.mk(pt(t[0].gx, t[0].gy)); uf.mk(pt(t[1].gx, t[1].gy));
    if (c.type === 'switch' && c.state === 'closed') uf.union(pt(t[0].gx, t[0].gy), pt(t[1].gx, t[1].gy));
  });
  wires.forEach(w => {
    for (let i = 0; i < w.length - 1; i++) uf.union(pt(w[i].gx, w[i].gy), pt(w[i + 1].gx, w[i + 1].gy));
  });

  const bt = getTerminals(batt);
  const gndK = uf.find(pt(bt[0].gx, bt[0].gy));
  const plusK = uf.find(pt(bt[1].gx, bt[1].gy));
  if (gndK === plusK) { state.analysis = { error: 'Short circuit detected!' }; updateAnalysis(); return; }

  const knownV = { [gndK]: 0, [plusK]: batt.value };
  const allNodes = new Set();
  comps.forEach(c => { const t = getTerminals(c); allNodes.add(uf.find(pt(t[0].gx, t[0].gy))); allNodes.add(uf.find(pt(t[1].gx, t[1].gy))); });
  const unknowns = [...allNodes].filter(k => !(k in knownV));
  const unkIdx = {}; unknowns.forEach((k, i) => { unkIdx[k] = i; });
  const M = unknowns.length;

  const G = Array.from({ length: M }, () => Array(M).fill(0));
  const rhs = Array(M).fill(0);

  resistive.forEach(c => {
    const t = getTerminals(c);
    const k0 = uf.find(pt(t[0].gx, t[0].gy));
    const k1 = uf.find(pt(t[1].gx, t[1].gy));
    if (k0 === k1) return;
    const g = 1 / c.value;
    const i0 = unkIdx[k0] ?? null, i1 = unkIdx[k1] ?? null;
    if (i0 !== null) G[i0][i0] += g;
    if (i1 !== null) G[i1][i1] += g;
    if (i0 !== null && i1 !== null) { G[i0][i1] -= g; G[i1][i0] -= g; }
    if (i0 !== null && k1 in knownV) rhs[i0] += g * knownV[k1];
    if (i1 !== null && k0 in knownV) rhs[i1] += g * knownV[k0];
  });

  let nodeV = { ...knownV };
  if (M > 0) {
    const sol = solveLinear(G, rhs);
    if (!sol) { state.analysis = { error: 'Open circuit — check wiring' }; updateAnalysis(); return; }
    unknowns.forEach((k, i) => { nodeV[k] = sol[i]; });
  }

  const results = { components: {} };
  let totalP = 0;
  resistive.forEach(c => {
    const t = getTerminals(c);
    const k0 = uf.find(pt(t[0].gx, t[0].gy));
    const k1 = uf.find(pt(t[1].gx, t[1].gy));
    const vDrop = Math.abs((nodeV[k0] ?? 0) - (nodeV[k1] ?? 0));
    const I = vDrop / c.value;
    results.components[c.id] = { V: vDrop, I, P: vDrop * I };
    totalP += vDrop * I;
  });

  const totalI = totalP > 0 ? totalP / batt.value : 0;
  const Req = totalI > 0 ? batt.value / totalI : Infinity;
  results.total = { V: batt.value, R: Req, I: totalI, P: totalP };
  results.components[batt.id] = { V: batt.value, I: totalI };
  state.analysis = results;
  updateAnalysis();
}

function setTool(t) {
  state.tool = t;
  state.wiringFrom = null;
  document.querySelectorAll('.pal-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  const tips = {
    select: 'Click a component to select it — click a switch to toggle it',
    wire: 'Click a terminal (dot) to start a wire, then click another terminal',
    battery: 'Click the grid to place a battery — press R to rotate',
    resistor: 'Click the grid to place a resistor — press R to rotate',
    bulb: 'Click the grid to place a bulb — press R to rotate',
    switch: 'Click the grid to place a switch — press R to rotate',
    led: 'Click the grid to place an LED — press R to rotate',
    motor: 'Click the grid to place a motor — press R to rotate',
  };
  setTip(tips[t] || '');
}

function setTip(txt) { $('tipText').textContent = txt; }

function updateProps() {
  const box = $('propBox');
  if (!state.sel) {
    box.innerHTML = '<p class="phase-note">Select a component to adjust its value</p>';
    return;
  }
  const c = state.comps.find(x => x.id === state.sel);
  if (!c) { box.innerHTML = ''; state.sel = null; return; }

  let h = `<div class="ctrl-label" style="margin-bottom:4px">${c.type[0].toUpperCase() + c.type.slice(1)} ${c.label || ''}</div>`;
  if (c.type === 'battery') {
    h += `<div class="ctrl-label">Voltage <span class="mono" id="valD">${c.value} V</span></div>`;
    h += `<input id="valS" type="range" min="1" max="24" step="0.5" value="${c.value}">`;
  } else if (c.type === 'resistor' || c.type === 'bulb' || c.type === 'led' || c.type === 'motor') {
    h += `<div class="ctrl-label">Resistance <span class="mono" id="valD">${fmtR(c.value)}</span></div>`;
    h += `<input id="valS" type="range" min="5" max="1000" step="1" value="${c.value}">`;
    if (c.type === 'led') {
      h += `<div class="ctrl-label" style="margin-top:8px">Color</div>`;
      h += `<div class="led-colors">`;
      ['#ef4444','#22c55e','#3b82f6','#eab308','#e5e7eb'].forEach(col => {
        h += `<button class="led-col${c.color === col ? ' active' : ''}" style="background:${col}" data-col="${col}"></button>`;
      });
      h += `</div>`;
    }
  }
  h += `<div class="play-row"><button class="btn btn-sm" id="btnDel">Delete component</button></div>`;
  box.innerHTML = h;

  const sl = $('valS');
  if (sl) sl.addEventListener('input', () => {
    c.value = parseFloat(sl.value);
    $('valD').textContent = c.type === 'battery' ? c.value + ' V' : fmtR(c.value);
    analyze(); renderAll();
  });
  if (c.type === 'led') {
    box.querySelectorAll('.led-col').forEach(btn => btn.addEventListener('click', () => {
      c.color = btn.dataset.col;
      box.querySelectorAll('.led-col').forEach(b => b.classList.toggle('active', b === btn));
      renderAll();
    }));
  }
  $('btnDel').addEventListener('click', () => {
    state.comps = state.comps.filter(x => x.id !== state.sel);
    removeWiresFor(c);
    state.sel = null;
    updateProps(); analyze(); renderAll();
  });
}

function updateAnalysis() {
  const box = $('analysisBox');
  const a = state.analysis;
  if (!a) { box.innerHTML = '<p class="phase-note">Build a complete circuit to see live readings</p>'; return; }
  if (a.error) { box.innerHTML = `<p class="phase-note" style="color:var(--err)">${a.error}</p>`; return; }
  const t = a.total;
  let h = '';
  h += `<div class="ro-row"><span>Battery</span><b class="mono">${t.V.toFixed(1)} V</b></div>`;
  h += `<div class="ro-row"><span>Total R</span><b class="mono">${t.R === Infinity ? '∞' : fmtR(Math.round(t.R * 100) / 100)}</b></div>`;
  h += `<div class="ro-row ro-total"><span>Current</span><b class="mono">${fmtI(t.I)}</b></div>`;
  h += `<div class="ro-row"><span>Power</span><b class="mono">${fmtP(t.P)}</b></div>`;
  const res = state.comps.filter(c => c.type === 'resistor' || c.type === 'bulb' || c.type === 'led' || c.type === 'motor');
  if (res.length) {
    h += '<hr class="panel-sep">';
    res.forEach(c => {
      const r = a.components[c.id];
      if (r) h += `<div class="ro-row"><span>${c.label || c.type}</span><b class="mono">${r.V.toFixed(2)}V \xb7 ${fmtI(r.I)}</b></div>`;
    });
  }
  h += `<div class="formula">V = IR \xb7 P = IV \xb7 P = I\xb2R</div>`;
  box.innerHTML = h;
}

function genProblem() {
  const inclP = $('chkParallel').checked;
  const type = inclP && Math.random() < 0.4 ? 'parallel' : 'series';
  const nR = type === 'series' ? (Math.random() < 0.45 ? 2 : 3) : 2;
  const V = [3, 6, 9, 12][Math.floor(Math.random() * 4)];
  const pool = [10, 22, 47, 100, 150, 220, 330, 470, 680, 1000];
  const Rs = Array.from({ length: nR }, () => pool[Math.floor(Math.random() * pool.length)]);

  let Req;
  if (type === 'series') Req = Rs.reduce((a, b) => a + b, 0);
  else Req = 1 / Rs.reduce((a, r) => a + 1 / r, 0);
  const Itot = V / Req;

  const qs = [
    { q: `What is the ${type === 'parallel' ? 'equivalent' : 'total'} resistance?`, a: Math.round(Req * 100) / 100, u: 'Ω', k: 'R' },
    { q: 'What is the total current from the battery?', a: Math.round(Itot * 1000 * 100) / 100, u: 'mA', k: 'I' },
  ];
  if (type === 'series') qs.push({ q: `What is the voltage across R${SUBS[0]} (${Rs[0]} Ω)?`, a: Math.round(Itot * Rs[0] * 100) / 100, u: 'V', k: 'VR' });
  if (type === 'parallel') qs.push({ q: `What is the current through R${SUBS[0]} (${Rs[0]} Ω)?`, a: Math.round(V / Rs[0] * 1000 * 100) / 100, u: 'mA', k: 'IR' });
  const pick = qs[Math.floor(Math.random() * qs.length)];

  const comps = [], wires = [];
  if (type === 'series') {
    comps.push({ id: 'pb', type: 'battery', x: 4, y: 7, rot: 90, value: V, label: '', state: null });
    for (let i = 0; i < nR; i++)
      comps.push({ id: 'pr' + i, type: 'resistor', x: 9 + i * 5, y: 4, rot: 0, value: Rs[i], label: 'R' + SUBS[i], state: null });
    wires.push([{ gx: 4, gy: 6 }, { gx: 4, gy: 4 }, { gx: 8, gy: 4 }]);
    for (let i = 0; i < nR - 1; i++) wires.push([{ gx: 10 + i * 5, gy: 4 }, { gx: 13 + i * 5, gy: 4 }]);
    const lx = 10 + (nR - 1) * 5;
    wires.push([{ gx: lx, gy: 4 }, { gx: lx + 3, gy: 4 }, { gx: lx + 3, gy: 8 }, { gx: 4, gy: 8 }]);
  } else {
    comps.push({ id: 'pb', type: 'battery', x: 4, y: 7, rot: 90, value: V, label: '', state: null });
    comps.push({ id: 'pr0', type: 'resistor', x: 12, y: 4, rot: 0, value: Rs[0], label: 'R' + SUBS[0], state: null });
    comps.push({ id: 'pr1', type: 'resistor', x: 12, y: 10, rot: 0, value: Rs[1], label: 'R' + SUBS[1], state: null });
    wires.push([{ gx: 4, gy: 6 }, { gx: 4, gy: 4 }, { gx: 11, gy: 4 }]);
    wires.push([{ gx: 4, gy: 8 }, { gx: 4, gy: 10 }, { gx: 11, gy: 10 }]);
    wires.push([{ gx: 13, gy: 4 }, { gx: 18, gy: 4 }, { gx: 18, gy: 10 }, { gx: 13, gy: 10 }]);
  }

  return { type, V, Rs, Req, Itot, nR, qText: pick.q, answer: pick.a, unit: pick.u, key: pick.k, comps, wires };
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
  const tol = Math.max(Math.abs(exp) * 0.03, 0.5);
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
  let s = '<ol>';
  if (p.type === 'series') {
    s += `<li>R<sub>total</sub> = ${p.Rs.join(' + ')} = <b>${p.Req.toFixed(2)} Ω</b></li>`;
    s += `<li>I = V \xf7 R = ${p.V} \xf7 ${p.Req.toFixed(2)} = <b>${(p.Itot * 1000).toFixed(2)} mA</b> (${p.Itot.toFixed(4)} A)</li>`;
    p.Rs.forEach((r, i) => {
      s += `<li>V<sub>R${SUBS[i]}</sub> = I \xd7 R${SUBS[i]} = ${(p.Itot * 1000).toFixed(2)}\xd710⁻\xb3 \xd7 ${r} = <b>${(p.Itot * r).toFixed(2)} V</b></li>`;
    });
  } else {
    s += `<li>1/R<sub>eq</sub> = 1/${p.Rs[0]} + 1/${p.Rs[1]} = ${(1 / p.Rs[0] + 1 / p.Rs[1]).toFixed(6)}</li>`;
    s += `<li>R<sub>eq</sub> = <b>${p.Req.toFixed(2)} Ω</b></li>`;
    s += `<li>I<sub>total</sub> = V \xf7 R<sub>eq</sub> = ${p.V} \xf7 ${p.Req.toFixed(2)} = <b>${(p.Itot * 1000).toFixed(2)} mA</b></li>`;
    p.Rs.forEach((r, i) => {
      s += `<li>I<sub>R${SUBS[i]}</sub> = V \xf7 R${SUBS[i]} = ${p.V} \xf7 ${r} = <b>${(p.V / r * 1000).toFixed(2)} mA</b></li>`;
    });
  }
  const finalVal = p.answer;
  s += `<li class="sol-final">Answer: <b>${finalVal.toFixed(2)} ${p.unit}</b></li>`;
  s += '</ol>';
  $('solutionBox').innerHTML = s;
  $('solutionBox').hidden = false;
}

function loadStats() {
  try { return JSON.parse(localStorage.getItem('simlab-cl-stats')) || { solved: 0, correct: 0, streak: 0, best: 0 }; }
  catch { return { solved: 0, correct: 0, streak: 0, best: 0 }; }
}
function saveStats() { localStorage.setItem('simlab-cl-stats', JSON.stringify(state.stats)); }
function updateStatsUI() {
  const s = state.stats;
  $('stSolved').textContent = s.solved;
  $('stAcc').textContent = s.solved > 0 ? Math.round(s.correct / s.solved * 100) + '%' : '—';
  $('stStreak').textContent = s.streak;
  $('stBest').textContent = s.best;
  $('stStreak').classList.toggle('fire', s.streak >= 3);
}

function setMode(m) {
  state.mode = m;
  document.body.dataset.mode = m;
  $('tabExplore').classList.toggle('active', m === 'explore');
  $('tabPractice').classList.toggle('active', m === 'practice');
  if (m === 'practice') {
    if (!state.problem) newProblem();
    else renderAll();
    updateStatsUI();
  } else {
    analyze(); renderAll();
  }
}

function init() {
  $('gridG').innerHTML = buildGrid();
  renderAll();

  document.querySelectorAll('.pal-btn[data-tool]').forEach(btn =>
    btn.addEventListener('click', () => setTool(btn.dataset.tool)));
  $('btnRotate').addEventListener('click', () => {
    state.rot = state.rot === 0 ? 90 : 0;
    $('btnRotate').textContent = state.rot + '\xb0';
    updateOverlay();
  });
  $('btnClear').addEventListener('click', () => {
    if (!state.comps.length && !state.wires.length) return;
    state.comps = []; state.wires = []; state.sel = null; state.wiringFrom = null; state.analysis = null;
    updateProps(); updateAnalysis(); renderAll();
    setTip('Circuit cleared — start building!');
  });

  SVG.addEventListener('click', onSvgClick);
  SVG.addEventListener('mousemove', onSvgMove);
  SVG.addEventListener('mouseleave', () => { state.mouseG = null; state.hoverTerm = null; updateOverlay(); });
  document.addEventListener('keydown', onKeyDown);

  $('tabExplore').addEventListener('click', () => setMode('explore'));
  $('tabPractice').addEventListener('click', () => setMode('practice'));
  $('btnCheck').addEventListener('click', checkAnswer);
  $('btnNew').addEventListener('click', newProblem);
  $('btnSolution').addEventListener('click', showSolution);
  $('ansInput').addEventListener('keydown', e => { if (e.key === 'Enter') checkAnswer(); });
  $('chkParallel').addEventListener('change', () => { if (state.mode === 'practice') newProblem(); });

  $('btnHelp').addEventListener('click', () => $('helpDlg').showModal());
  $('btnHelpClose').addEventListener('click', () => $('helpDlg').close());
  $('helpDlg').addEventListener('click', e => { if (e.target === $('helpDlg')) $('helpDlg').close(); });

  setTool('select');
  updateStatsUI();
}

init();
})();
