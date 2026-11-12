// DV70 ORIGAMI FAQ · app: layout, the accordion state machine, concertina kinematics, DOM text slices, wall light,
// the on-demand scheduler (sleeps at rest) and the WebGL lifecycle. Test hook: window.__faq.
import { createRenderer } from './paper.js';
import { createCrane } from './crane.js';

const $ = (s, r = document) => r.querySelector(s);
const Q = new URLSearchParams(location.search);
const html = document.documentElement;
const rmq = matchMedia('(prefers-reduced-motion: reduce)');
let RM = rmq.matches;
const KEY_OPEN = 'dv70.v1.open', KEY_HELP = 'dv70.v1.helpful';
const PI = Math.PI, HALF = PI / 2;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};

const el = {
  stage: $('#stage'), faq: $('#faq'), gl: $('#gl'), slices: $('#slices'), wall: $('#wall'), crane: $('#crane'), craneBox: $('.crane-box'),
};
// window light: from the upper left, in front of the wall (x right, y down, z towards the viewer)
const L = (() => { const v = [-0.28, -0.62, 0.73]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
const ZW = 9;                          // the cards float this far above the wall
const GOBO = { dx: 0.883, dy: 0.469, period: 112, strength: 0.17, paper: 2.0 };

// ---------------------------------------------------------------- items
const items = [...document.querySelectorAll('.item')].map((node, i) => ({
  i, node, btn: $('.q', node), ans: $('.ans', node), ansIn: $('.ans-in', node), help: $('.help', node),
  p: 0, v: 0, target: 0, navy: 0, hover: 0, hoverT: 0, press: 0, pressT: 0, ptr: [0, 0],
  Hc: 76, N: 2, y: 0, foldH: 0, disabled: false, slices: [], sliceOn: false, panels: [],
}));
if (Q.has('disabled')) { const it = items[4]; it.disabled = true; it.node.classList.add('disabled'); it.btn.setAttribute('aria-disabled', 'true'); }

// ---------------------------------------------------------------- metrics + layout
const G = { wide: true, s: 1, listW: 640, Hc: 76, LH: 27, Hp: 54, gap: 14, M: 48, F: 1100, eyeUp: 150, dpr: 1, pageX: 0, pageY: 0, canvasH: 0 };
function metrics() {
  const W = innerWidth, H = innerHeight;
  G.wide = W >= 1000 && W / H >= 1.15 && H >= 540;
  html.classList.toggle('narrow', !G.wide); html.classList.toggle('wide', G.wide);
  let s, listW, Hc, LH, fs, qfs, padx, tx, gap;
  if (G.wide) {
    s = Math.max(0.74, Math.min(1.55, Math.min(W / 1600, H / 1000)));
    listW = Math.round(Math.min(740 * s, W * 0.52)); Hc = 80 * s; LH = Math.round(28 * s * 2) / 2; fs = Math.max(14, 17 * s); qfs = Math.max(16, 20 * s);
    padx = 32 * s; tx = 80 * s; gap = 14 * s;
  } else {
    s = Math.max(0.9, Math.min(1.2, W / 430));
    listW = Math.round(Math.min(W - 36, 640)); Hc = W < 360 ? 62 : 66; LH = W < 360 ? 23 : 24; fs = W < 360 ? 14 : 14.5; qfs = W < 360 ? 15 : 16;
    padx = W < 360 ? 14 : 18; tx = W < 360 ? 48 : 58; gap = W < 600 ? 14 : 16;
    if (W >= 600) {                    // tablets: the phone composition, scaled up so the paper still fills the frame
      const k = Math.min(1.35, W / 640); s = k;
      listW = Math.round(Math.min(W - 64, 860)); Hc = Math.round(70 * k); LH = Math.round(24 * k); fs = 14.5 * k; qfs = 17 * k; padx = 24 * k; tx = 66 * k; gap = 16 * k;
    }
  }
  G.s = s; G.listW = listW; G.Hc = Hc; G.LH = LH; G.Hp = 2 * LH; G.gap = gap; G.M = Math.round(48 * Math.max(0.8, s));
  G.F = (G.wide ? 1150 : 900) * Math.max(0.85, s); G.eyeUp = G.wide ? 150 * s : 120;
  const r = html.style;
  r.setProperty('--s', s.toFixed(4)); r.setProperty('--listw', listW + 'px'); r.setProperty('--hc', Hc + 'px');
  r.setProperty('--lh', LH + 'px'); r.setProperty('--hp', 2 * LH + 'px'); r.setProperty('--gap', gap + 'px');
  r.setProperty('--fs', fs + 'px'); r.setProperty('--qfs', qfs + 'px'); r.setProperty('--padx', padx + 'px'); r.setProperty('--tx', tx + 'px');
  r.setProperty('--m', G.M);
}
function measure() {
  for (const it of items) {
    it.Hc = Math.max(G.Hc, Math.ceil(it.btn.offsetHeight));
    it.node.style.setProperty('--hct', it.Hc + 'px');
    // answer height in whole panel pairs (creases fall between text lines: Hp = 2 lines)
    const wasHidden = it.ans.hidden; it.ans.hidden = false;
    const h = it.ansIn.offsetHeight;
    it.ans.hidden = wasHidden;
    const N = Math.max(2, Math.ceil((h - 0.5) / G.Hp));
    it.N = N; it.ans.style.height = N * G.Hp + 'px';
  }
  buildSlices();
}
function maxFolds() { const f = items.map((it) => it.N * G.Hp).sort((a, b) => b - a); return (f[0] || 0) + (f[1] || 0); }
function layout() {
  metrics(); measure();
  G.dpr = Math.min(devicePixelRatio || 1, 2);
  const base = items.reduce((s, it) => s + it.Hc + G.gap, 0);
  G.canvasH = Math.ceil(base + maxFolds() + 2 * G.M);
  const cw = G.listW + 2 * G.M;
  el.gl.style.width = cw + 'px'; el.gl.style.height = G.canvasH + 'px';
  if (renderer) renderer.resize(cw, G.canvasH, G.dpr, G.M);
  sizeCrane();
  place(true);
  setFaqHeight(finalHeight());
  html.classList.remove('cap-flow', 'mark-off');
  if (G.wide) {
    const cap = $('.cap').getBoundingClientRect(), lede = $('.lede').getBoundingClientRect(), st = el.faq.getBoundingClientRect(), mk = $('.brandmark').getBoundingClientRect();
    if (lede.bottom + 16 > cap.top) html.classList.add('cap-flow');
    const tall = items.reduce((t, it) => t + it.Hc + G.gap, 0) + Math.max(...items.map((it) => it.N * G.Hp));
    if (mk.top < st.top + tall + 30 && mk.left < st.right + 20) html.classList.add('mark-off');
  }
  pagePos(); drawWall();
  dirty = true; kick();
}
function pagePos() { const r = el.faq.getBoundingClientRect(); G.pageX = r.left + scrollX; G.pageY = r.top + scrollY; }
function finalHeight() {
  let y = 0; items.forEach((it, k) => { y += it.Hc + (it.target > 0.5 ? it.N * G.Hp : 0) + (k < items.length - 1 ? G.gap : 0); }); return y;
}
let faqH = 0;
function setFaqHeight(h) { if (Math.abs(h - faqH) > 0.5) { faqH = h; el.faq.style.setProperty('--faqh', h + 'px'); } }

// ---------------------------------------------------------------- concertina kinematics
const REST = 0.245;                    // the opened sheet keeps its folds (14°): a real concertina, never ironed flat
const PL = () => G.Hp / Math.cos(REST); // panel length: at rest each panel projects to exactly Hp, so the flat text never drifts off its panel
function pairAngles(it) {
  const M = Math.ceil(it.N / 2), sig = M > 1 ? 0.45 : 0, out = [];
  for (let j = 0; j < M; j++) {
    const s0 = M > 1 ? sig * j / (M - 1) : 0;
    const q = Math.max(0, Math.min(1, (it.p - s0) / (1 - sig)));
    const e = q * q * (3 - 2 * q) * 0.35 + q * 0.65;
    let b = HALF * (1 - e) + REST * e;
    if (it.p > 1) b -= (it.p - 1) * 0.9;            // a soft overshoot: the paper springs a touch past flat
    out.push(Math.max(-0.08, b));
  }
  return out;
}
function fold(it, hingeY) {
  const panels = [];
  if (it.p <= 0.0005 && it.v === 0) { it.foldH = 0; it.panels = panels; return; }
  const ang = pairAngles(it);
  let y = hingeY, z = 0, fh = 0;
  for (let k = 0; k < it.N; k++) {
    const b = ang[k >> 1], sg = k % 2 ? -1 : 1;
    const L = PL(), dy = Math.cos(b) * L, dz = sg * Math.sin(b) * L;
    panels.push({ k, b, sg, y0: y, z0: z, y1: y + dy, z1: z + dz });
    y += dy; z += dz; fh += dy;
  }
  it.foldH = fh; it.panels = panels;
}
function place(force) {
  let y = 0;
  for (const it of items) {
    it.y = y;
    fold(it, y + it.Hc);
    const ty = snap(y);
    if (force || it._ty !== ty) { it._ty = ty; it.node.style.transform = `translate3d(0,${ty}px,0)`; }
    y += it.Hc + it.foldH + G.gap;
  }
  return y - G.gap;
}
function snap(v) { const d = devicePixelRatio || 1; return Math.round(v * d) / d; }

// ---------------------------------------------------------------- DOM text slices (one per panel, aria-hidden clones)
function buildSlices() {
  el.slices.textContent = '';
  for (const it of items) {
    it.slices = []; const html = cloneHTML(it);
    for (let k = 0; k < it.N; k++) {
      const s = document.createElement('div'); s.className = 'slice';
      s.style.width = G.listW + 'px'; s.style.height = G.Hp + 'px'; s.style.opacity = '0'; s._v = 0;
      const inner = document.createElement('div'); inner.className = 'slice-in';
      inner.innerHTML = html; inner.style.top = (-k * G.Hp) + 'px';
      s.appendChild(inner); el.slices.appendChild(s); it.slices.push(s);
    }
    it.sliceOn = false;
  }
}
// clones carry no interactive or semantic elements (buttons/links/paragraphs become spans/divs with the same classes)
function cloneHTML(it) {
  const t = document.createElement('div'); t.innerHTML = it.ansIn.innerHTML;
  t.querySelectorAll('button, a, p').forEach((n) => {
    const r = document.createElement(n.tagName === 'P' ? 'div' : 'span');
    r.className = (n.className ? n.className + ' ' : '') + (n.tagName === 'P' ? 'p' : n.tagName === 'A' ? 'a' : 'btn');
    if (n.getAttribute('aria-pressed')) r.dataset.pressed = n.getAttribute('aria-pressed');
    r.innerHTML = n.innerHTML; n.replaceWith(r);
  });
  t.querySelectorAll('[id],[role],[tabindex]').forEach((n) => { n.removeAttribute('id'); n.removeAttribute('role'); n.removeAttribute('tabindex'); });
  return t.innerHTML;
}
function refreshSlice(it) { const h = cloneHTML(it); it.slices.forEach((s) => { s.firstChild.innerHTML = h; }); }
function proj(O, x, y, z) { const w = G.F / (G.F - z); return [O[0] + (x - O[0]) * w, O[1] + (y - O[1]) * w]; }
function homography(W, H, q) {
  const [x0, y0] = q[0], [x1, y1] = q[1], [x2, y2] = q[2], [x3, y3] = q[3];
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) { g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den; }
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  return `matrix3d(${a / W},${d / W},0,${g / W},${b / H},${e / H},0,${h / H},0,0,1,0,${c},${f},0,1)`;
}
function eyeOf(it) { return [G.listW / 2, it.y + it.Hc + it.N * G.Hp * 0.42]; }   // eye level with the sheet: ridges widen, nothing drifts
function syncText(it, moving) {
  // at rest (open) the real answer is shown untransformed (sharp); while moving the slices ride the panels
  const show = moving && !!renderer && it.panels.length > 0;
  if (show !== it.sliceOn) {
    it.sliceOn = show;
    it.slices.forEach((s) => { s.style.transition = show ? 'none' : 'opacity .28s linear'; });
    if (!show) it.slices.forEach((s) => { if (s._v !== 0) { s._v = 0; s.style.opacity = '0'; } });
    it.ans.classList.toggle('moving', moving);
  } else it.ans.classList.toggle('moving', moving);
  if (!renderer && moving) {           // CSS fallback: the flat sheet is revealed from the top
    it.ans.style.clipPath = `inset(0 0 ${Math.max(0, it.N * G.Hp - it.foldH)}px 0)`;
  } else if (it.ans.style.clipPath) it.ans.style.clipPath = '';
  if (!show) return;
  const O = eyeOf(it), W = G.listW;
  for (const p of it.panels) {
    const s = it.slices[p.k];
    const q = [proj(O, 0, p.y0, p.z0), proj(O, W, p.y0, p.z0), proj(O, W, p.y1, p.z1), proj(O, 0, p.y1, p.z1)];
    const alpha = panelAlpha(p.b);
    // a panel turned away from the eye shows the back of the sheet (no print)
    const ny = -p.sg * Math.sin(p.b), nz = Math.cos(p.b);
    const vy = O[1] - (p.y0 + p.y1) / 2, vz = G.F - (p.z0 + p.z1) / 2;
    const facing = ny * vy + nz * vz > 0;
    if (alpha < 0.02 || !facing || q[3][1] - q[0][1] < 0.6) { if (s._v !== 0) { s._v = 0; s.style.opacity = '0'; } continue; }
    s.style.transform = homography(W, G.Hp, q);
    const o = alpha.toFixed(3); if (s._v !== o) { s._v = o; s.style.opacity = o; }
  }
}
function panelAlpha(b) { const t = Math.max(0, Math.min(1, (b - 1.30) / (HALF - 1.30))); return 1 - t * t * (3 - 2 * t); }

// ---------------------------------------------------------------- the wall light (window blinds), page px, same formula as the GL
function goboBand(f) { const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }; return sm(0, 0.22, f) * (1 - sm(0.40, 0.66, f)); }
function goboMask() { const W = innerWidth, H = innerHeight; return G.wide ? [W * 0.40, H * 0.42, W * 0.62, H * 0.85] : [W * 0.5, H * 0.35, W * 1.1, H * 0.75]; }
function maskAt(m, x, y) { const dx = (x - m[0]) / m[2], dy = (y - m[1]) / m[3]; const r = Math.sqrt(dx * dx + dy * dy); return 0.25 + 0.75 * Math.max(0, 1 - r * r); }
function drawWall() {
  const W = document.documentElement.clientWidth, H = Math.max(innerHeight, document.body.scrollHeight);
  const k = 4, cw = Math.ceil(W / k), ch = Math.ceil(H / k);
  const c = el.wall; c.width = cw; c.height = ch; c.style.width = cw * k + 'px'; c.style.height = ch * k + 'px';
  const g = c.getContext('2d'); if (!g) return;
  const im = g.createImageData(cw, ch), d = im.data, m = goboMask();
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const x = (i + 0.5) * k, y = (j + 0.5) * k;
    const t = (x * GOBO.dx + y * GOBO.dy) / GOBO.period; const f = t - Math.floor(t);
    const a = GOBO.strength * goboBand(f) * maskAt(m, x, y);
    const o = (j * cw + i) * 4;
    // multiply layer: white = no change, the band darkens towards a warm umber
    d[o] = 255 - a * (255 - 120); d[o + 1] = 255 - a * (255 - 82); d[o + 2] = 255 - a * (255 - 44); d[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
}

// ---------------------------------------------------------------- renderers
let renderer = null, crane = null;
function startGL() {
  if (html.classList.contains('no-gl') && Q.has('nogl')) return;
  try { renderer = createRenderer(el.gl); } catch (e) { console.warn('[dv70] paper', e); renderer = null; }
  html.classList.toggle('no-gl', !renderer);
}
function startCrane() {
  if (Q.has('nogl')) { html.classList.add('no-crane'); return; }
  try { crane = createCrane(el.crane); } catch (e) { console.warn('[dv70] crane', e); crane = null; }
  html.classList.toggle('no-crane', !crane);
}
startGL(); startCrane();
el.gl.addEventListener('webglcontextlost', (e) => { e.preventDefault(); renderer = null; html.classList.add('no-gl'); items.forEach((it) => syncText(it, false)); layout(); });
el.gl.addEventListener('webglcontextrestored', () => { startGL(); layout(); });
el.crane.addEventListener('webglcontextlost', (e) => { e.preventDefault(); crane = null; html.classList.add('no-crane'); });
el.crane.addEventListener('webglcontextrestored', () => { startCrane(); sizeCrane(); craneWake(4); });

function frameState() {
  const cards = [], panels = [];
  for (const it of items) {
    const z = 2.6 * it.hover - 1.4 * it.press;
    cards.push({ x: 0, y: it.y, w: G.listW, h: it.Hc, z, navy: it.navy, hover: it.hover, press: it.press, dog: 22 * Math.max(0.8, G.s),
      ptr: it.ptr, seed: it.i * 1.7 + 0.3, alpha: it.disabled ? 0.82 : 1 });
    if (!it.panels.length) continue;
    const O = eyeOf(it);
    let sheetY = 0;
    it.panels.forEach((p, idx) => {
      const prev = it.panels[idx - 1], next = it.panels[idx + 1];
      const nrm = (q) => { const dy = q.y1 - q.y0, dz = q.z1 - q.z0, l = Math.hypot(dy, dz) || 1; return [-dz / l, dy / l]; };
      const n = nrm(p);
      panels.push({
        k: p.k, x: 0, w: G.listW, h: PL(), sy: sheetY, y0: p.y0, z0: p.z0, y1: p.y1, z1: p.z1, O,
        bow: 1.1 * Math.sin(Math.max(0, p.b)) * (G.Hp / 54),
        ct: p.k === 0 ? 0 : (p.k % 2 ? 2 : 1), cb: p.k % 2 ? 1 : 2,
        bt: prev ? (prev.b + p.b) / 2 : p.b * 0.5, bb: next ? (next.b + p.b) / 2 : 0,
        np: prev ? nrm(prev) : [0, 1], nn: next ? nrm(next) : n, last: !next,
        mark: it.i === 1 && (p.k === it.N - 3 || p.k === it.N - 4), markPos: [G.listW - 150 * Math.max(0.8, G.s), (it.N - 4) * PL() + PL() * 0.55],
        seed: it.i * 3.1 + 1.0, alpha: panelAlpha(p.b), sg: p.sg, tilt: Math.max(0, 0.13 - Math.abs(p.b)) * 0.62,
      });
      sheetY += PL();
    });
  }
  return {
    O: [G.listW / 2, -G.eyeUp], F: G.F, L, Zw: ZW, gobo: [GOBO.dx, GOBO.dy, GOBO.period, GOBO.strength * GOBO.paper], goboOff: [G.pageX, G.pageY],
    goboMask: goboMask(), sun: [innerWidth * 0.62, innerHeight * 0.26, innerWidth * 0.6, innerHeight * 0.75], cards, panels, shadowK: [0.27, 0.28],
  };
}

// ---------------------------------------------------------------- scheduler (sleeps at rest)
let raf = 0, last = 0, frames = 0, dirty = true;
function kick() { if (!raf) raf = requestAnimationFrame(frame); }
function spring(o, key, vkey, target, k, d, dt) {
  const x = o[key], v = o[vkey] || 0;
  const a = (target - x) * k - v * d;
  const nv = v + a * dt, nx = x + nv * dt;
  o[vkey] = nv; o[key] = nx;
  if (Math.abs(target - nx) < 0.0006 && Math.abs(nv) < 0.004) { o[key] = target; o[vkey] = 0; return false; }
  return true;
}
function frame(now) {
  raf = 0; const dt = last && now - last < 100 ? Math.min(0.034, (now - last) / 1000) : 1 / 60; last = now; frames++;
  let active = false;
  const moving = new Set();
  for (const it of items) {
    // the unfold: a slightly under-damped spring (paper settles with a soft overshoot)
    if (it.p !== it.target || it.v !== 0) {
      const sub = 2, h = dt / sub; let go = false;
      for (let s = 0; s < sub; s++) go = spring(it, 'p', 'v', it.target, it.target > 0.5 ? 13 : 26, it.target > 0.5 ? 6.2 : 9.2, h);
      if (it.p < 0) { it.p = 0; it.v = Math.max(0, it.v); if (it.target === 0 && it.v < 0.02) { it.v = 0; go = false; } }
      if (go) { active = true; moving.add(it); } else onSettled(it);
    }
    const nT = it.target > 0.5 ? 1 : 0;
    if (it.navy !== nT) { it.navy += (nT - it.navy) * Math.min(1, dt * 9); if (Math.abs(nT - it.navy) < 0.004) it.navy = nT; else active = true; }
    if (it.hover !== it.hoverT) { it.hover += (it.hoverT - it.hover) * Math.min(1, dt * 12); if (Math.abs(it.hoverT - it.hover) < 0.005) it.hover = it.hoverT; else active = true; }
    if (it.press !== it.pressT) { it.press += (it.pressT - it.press) * Math.min(1, dt * 22); if (Math.abs(it.pressT - it.press) < 0.005) it.press = it.pressT; else active = true; }
  }
  const total = place(false);
  // while folding, the list keeps an upper-bound height (one layout per toggle, not one per frame)
  if (moving.size) { if (total > faqH) setFaqHeight(Math.max(total, items.reduce((t, it) => t + it.Hc + G.gap, 0) - G.gap + maxFolds())); }
  else setFaqHeight(Math.max(total, finalHeight()));
  for (const it of items) syncText(it, moving.has(it));
  if (renderer && (active || dirty)) {
    // repaint only the strip that changed (the items that moved/changed, before and after), unless a full redraw is due
    let band = null;
    if (!dirty) {
      let y0 = Infinity, y1 = -Infinity;
      for (const it of items) {
        const top = it.y, bot = it.y + it.Hc + Math.max(it.foldH, 0);
        const ch = it._rt === undefined || Math.abs(it._rt - top) > 0.01 || Math.abs(it._rb - bot) > 0.01 || it.p !== it.target || it.v !== 0
          || it._rh !== it.hover || it._rp !== it.press || it._rn !== it.navy || it._rx !== it.ptr[0] || it._ry !== it.ptr[1];
        if (ch) { y0 = Math.min(y0, top, it._rt ?? top); y1 = Math.max(y1, bot, it._rb ?? bot); }
      }
      band = y0 < y1 ? [y0 - 70, y1 + 90] : [0, 0];
    }
    renderer.render(frameState(), band);
    for (const it of items) { it._rt = it.y; it._rb = it.y + it.Hc + Math.max(it.foldH, 0); it._rh = it.hover; it._rp = it.press; it._rn = it.navy; it._rx = it.ptr[0]; it._ry = it.ptr[1]; }
  }
  dirty = false;
  const craneOn = craneFrame(now, dt);
  if (active || craneOn) kick();
  else { setFaqHeight(finalHeight()); }
}
function onSettled(it) {
  if (it.target > 0.5) { it.ans.hidden = false; }
  else { it.ans.hidden = true; }
  syncText(it, false);
}

// ---------------------------------------------------------------- crane: floats, follows the pointer, then sleeps
const C = { scale: 1.4, flap0: 0, t: 0, amp: 0, ampT: 1, until: 0, yaw: 0.45, yawT: 0.45, pitch: 0.4, pitchT: 0.4, on: false, w: 400, h: 300 };
function sizeCrane() {
  if (!crane) return;
  const r = el.craneBox.getBoundingClientRect(); C.w = r.width; C.h = r.height;
  crane.resize(r.width, r.height, Math.min(devicePixelRatio || 1, 2));
  drawCrane();
}
function craneWake(sec = 10) { if (!crane) return; C.until = performance.now() + (RM ? 0 : sec * 1000); C.ampT = RM ? 0 : 1; kick(); }
function drawCrane() {
  if (!crane) return;
  const t = C.t, a = C.amp;
  crane.render({ yaw: C.yaw + Math.sin(t * 0.37) * 0.10 * a, pitch: C.pitch + Math.sin(t * 0.51 + 1) * 0.04 * a, roll: Math.sin(t * 0.8) * 0.045 * a,
    bob: (0.5 + 0.5 * Math.sin(t * 1.05)) * 0.22 * a + 0.04, flap: Math.sin(t * 1.6) * 0.07 * a + (C.flap0 || 0), scale: C.scale || 1.4, cx: 0, cy: -0.05 });
}
function craneFrame(now, dt) {
  if (!crane) return false;
  if (now > C.until) C.ampT = 0;
  let live = false;
  if (C.amp !== C.ampT) { C.amp += (C.ampT - C.amp) * Math.min(1, dt * (C.ampT ? 1.5 : 0.9)); if (Math.abs(C.amp - C.ampT) < 0.002) C.amp = C.ampT; live = true; }
  if (Math.abs(C.yaw - C.yawT) > 0.0005 || Math.abs(C.pitch - C.pitchT) > 0.0005) { C.yaw += (C.yawT - C.yaw) * Math.min(1, dt * 4); C.pitch += (C.pitchT - C.pitch) * Math.min(1, dt * 4); live = true; }
  if (C.amp > 0) { C.t += dt; live = true; }
  if (live || C.on !== live) drawCrane();
  C.on = live;
  return live;
}
addEventListener('pointermove', (e) => {
  if (!crane || RM || e.pointerType === 'touch') return;
  const r = el.craneBox.getBoundingClientRect();
  const nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (innerWidth * 0.6)));
  const ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (innerHeight * 0.7)));
  C.yawT = 0.45 + nx * 0.3; C.pitchT = 0.4 + ny * 0.12;
  if (performance.now() > C.until - 6000) C.until = performance.now() + 6000;
  C.ampT = 1; kick();
}, { passive: true });

// ---------------------------------------------------------------- accordion
function setOpen(i, open, { animate = true, focus = false } = {}) {
  const it = items[i]; if (!it || it.disabled) return;
  if (open) items.forEach((o) => { if (o !== it && o.target > 0.5) setOpen(o.i, false, { animate }); });
  it.target = open ? 1 : 0;
  it.node.classList.toggle('open', open);
  it.btn.setAttribute('aria-expanded', String(open));
  if (open) it.ans.hidden = false;           // the region exists while it unfolds (inert visual handled by .moving)
  if (!animate || RM || !renderer && RM) { it.p = it.target; it.v = 0; it.navy = it.target; onSettled(it); }
  else if (open && it.p === 0) it.v = 0.15;
  if (animate && !RM) setFaqHeight(Math.max(faqH, items.reduce((t, o) => t + o.Hc + G.gap, 0) - G.gap + maxFolds()));
  else setFaqHeight(finalHeight());
  store.set(KEY_OPEN, String(items.findIndex((o) => o.target > 0.5)));
  if (focus) it.btn.focus();
  dirty = true; kick();
}
items.forEach((it) => {
  it.btn.addEventListener('click', () => { if (it.disabled) { it.pressT = 0; return; } setOpen(it.i, !(it.target > 0.5)); });
  it.btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !it.disabled) { it.hoverT = 1; kick(); } });
  it.btn.addEventListener('pointerleave', () => { it.hoverT = 0; it.pressT = 0; kick(); });
  it.btn.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = it.btn.getBoundingClientRect(); it.ptr = [e.clientX - r.left, e.clientY - r.top];
    if (it.hover > 0) { dirty = true; kick(); }
  });
  it.btn.addEventListener('pointerdown', (e) => { if (it.disabled) return; const r = it.btn.getBoundingClientRect(); it.ptr = [e.clientX - r.left, e.clientY - r.top]; it.pressT = 1; kick(); });
  for (const ev of ['pointerup', 'pointercancel']) it.btn.addEventListener(ev, () => { it.pressT = 0; kick(); });
});
el.faq.addEventListener('keydown', (e) => {
  const i = items.findIndex((it) => it.btn === document.activeElement); if (i < 0) return;
  let j = -1;
  if (e.key === 'ArrowDown') j = (i + 1) % items.length;
  else if (e.key === 'ArrowUp') j = (i - 1 + items.length) % items.length;
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = items.length - 1;
  if (j >= 0) { e.preventDefault(); items[j].btn.focus(); }
});

// "Was this helpful?" (success state, remembered)
let helpful = {};
try { helpful = JSON.parse(store.get(KEY_HELP) || '{}') || {}; } catch (e) { helpful = {}; }
function applyHelp(it) {
  const v = helpful[it.i]; const h = it.help;
  h.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  h.classList.toggle('done', !!v);
  $('.thanks', h).textContent = v ? (v === 'yes' ? 'Thanks — glad it helped.' : 'Thanks — we will make this answer better.') : '';
}
items.forEach((it) => {
  applyHelp(it);
  it.help.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    helpful[it.i] = b.dataset.v; store.set(KEY_HELP, JSON.stringify(helpful));
    applyHelp(it); refreshSlice(it);
    const t = $('.thanks', it.help); t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true });
  });
});

// ---------------------------------------------------------------- boot
let loseExt = null;
let resolveReady; const ready = new Promise((r) => { resolveReady = r; });
let rT = 0;
addEventListener('resize', () => { cancelAnimationFrame(rT); rT = requestAnimationFrame(() => layout()); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { dirty = true; kick(); } });
rmq.addEventListener('change', () => { RM = rmq.matches; if (RM) { C.ampT = 0; items.forEach((it) => { it.p = it.target; it.v = 0; it.navy = it.target; onSettled(it); }); dirty = true; kick(); } });
(async () => {
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch (e) {}
  layout();
  const st = store.get(KEY_OPEN);
  const open = st === null ? 1 : Math.max(-1, Math.min(items.length - 1, parseInt(st, 10)));
  if (open >= 0 && !items[open].disabled) {
    if (RM) setOpen(open, true, { animate: false });
    else {
      // the showcase: the card turns navy and its answer unfolds, crease by crease, in the first second
      setTimeout(() => setOpen(open, true), 260);
    }
  }
  craneWake(Q.has('sleep') ? Math.max(0, +Q.get('sleep')) : 10);
  new ResizeObserver(() => { pagePos(); }).observe(document.body);
  // fonts may land after first layout; re-measure once more
  document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => layout());
  resolveReady();
})();

window.__faq = {
  ready,
  get busy() { return !!raf; },
  get moving() { return items.some((it) => it.p !== it.target || it.v !== 0 || it.navy !== it.target); },
  get frames() { return frames; },
  state() {
    return {
      wide: G.wide, s: G.s, listW: G.listW, Hp: G.Hp, LH: G.LH, gl: !!renderer, crane: !!crane, draws: renderer ? renderer.draws : 0, craneDraws: crane ? crane.draws : 0,
      sleeping: !raf, canvas: [el.gl.width, el.gl.height], faqH, craneAmp: +C.amp.toFixed(3), noGl: html.classList.contains('no-gl'),
      items: items.map((it) => ({ p: +it.p.toFixed(4), target: it.target, navy: +it.navy.toFixed(3), N: it.N, Hc: it.Hc, y: +it.y.toFixed(2), foldH: +it.foldH.toFixed(2),
        expanded: it.btn.getAttribute('aria-expanded'), hidden: it.ans.hidden, hover: +it.hover.toFixed(3), press: +it.press.toFixed(3), slices: it.sliceOn, disabled: it.disabled, transform: it.node.style.transform })),
    };
  },
  open(i, v = true, animate = true) { setOpen(i, v, { animate }); },
  craneTest(o) { Object.assign(C, o); C.amp = 0; C.ampT = 0; C.until = 0; drawCrane(); },
  lose() { loseExt = renderer && renderer.lose(); return !!loseExt; },
  restore() { if (loseExt) loseExt.restoreContext(); loseExt = null; },
};
