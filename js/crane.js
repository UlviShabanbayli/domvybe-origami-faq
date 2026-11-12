// DV70 ORIGAMI FAQ · the folded crane (WebGL2): flat-folded facets of cotton paper, vermilion washi wings, cream body,
// crisp crease edges, light through the thin wing tips and a soft shadow on the wall below. Drawn on demand.
import { program, bakeFibre, quadBuffer } from './paper.js';

const VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aC; layout(location=3) in vec4 aB;
uniform mat4 uMVP, uM; uniform float uFlap;
out vec3 vN; out vec3 vC; out vec3 vB; out vec3 vO; out vec3 vW; out float vTip;
vec3 rotX(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x, c*p.y - s*p.z, s*p.y + c*p.z); }
void main(){
  vec3 p = aP, n = aN;
  if (aB.w != 0.){                        // wings hinge on the body ridge (the x axis at y = .06)
    float a = uFlap*sign(aB.w);
    p.y -= .06; p = rotX(p, a); p.y += .06; n = rotX(n, a);
  }
  vec4 w = uM*vec4(p, 1.);
  vW = w.xyz; vN = mat3(uM)*n; vC = aC; vB = aB.xyz; vO = aP; vTip = abs(aB.w) > 1.5 ? 1. : 0.;
  gl_Position = uMVP*vec4(p, 1.);
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vC; in vec3 vB; in vec3 vO; in vec3 vW; in float vTip;
uniform vec3 uL, uEye; uniform sampler2D uFib;
out vec4 o;
void main(){
  vec3 V = normalize(uEye - vW);
  vec3 n = normalize(vN); bool back = dot(n, V) < 0.; if (back) n = -n;
  vec3 an = abs(n);
  vec2 uv = an.x > an.y && an.x > an.z ? vO.yz : (an.y > an.z ? vO.xz : vO.xy);
  vec4 fb = texture(uFib, uv*.9 + .37);
  vec4 fb2 = texture(uFib, uv*.23 + .11);
  vec3 alb = vC*(.97 + .07*(fb.r - .5) + .04*(fb2.r - .5));
  alb += vec3(.03)*max(fb.a - .5, 0.)*(1. - vC.b);
  n = normalize(n + vec3(fb.g - .5, fb.b - .5, 0.)*.05);
  vec3 L = normalize(uL);
  float ndl = dot(n, L);
  float diff = clamp((ndl + .35)/1.35, 0., 1.);
  float sky = .62 + .14*n.y + .08*n.z;
  vec3 col = alb*(sky + .55*diff);
  // light through thin paper where a facet turns away from the window (strongest at the wing tips)
  col += alb*vec3(1., .80, .62)*clamp(-ndl, 0., 1.)*(.55 + .35*vTip);
  // crisp creases: a bright crushed-fibre line on every folded edge, a hair of shadow just inside it
  float e = min(min(vB.x, vB.y), vB.z);
  float fw = fwidth(e);
  col += vec3(.10, .09, .07)*(1. - smoothstep(0., fw*1.6, e));
  col *= 1. - .07*(1. - smoothstep(fw*1.2, fw*5., e))*smoothstep(0., fw*1.6, e);
  if (back) col *= .93;
  o = vec4(col, 1.);
}`;
const VS_SH = `#version 300 es
layout(location=0) in vec2 a;
uniform vec4 uBox; out vec2 vU;
void main(){ vU = a*2. - 1.; vec2 p = uBox.xy + (a - .5)*uBox.zw; gl_Position = vec4(p, 0., 1.); }`;
const FS_SH = `#version 300 es
precision mediump float;
in vec2 vU; uniform float uA; out vec4 o;
void main(){ float r = dot(vU, vU); float a = uA*exp(-r*3.2); o = vec4(vec3(.24, .15, .07)*a, a); }`;

// ---------- the mesh (x: neck → tail, y up, z: wingspan)
function craneMesh() {
  const CREAM = [.965, .935, .88], CREAM2 = [.88, .845, .78], RED = [.86, .38, .26], RED2 = [.76, .31, .21], RED3 = [.94, .49, .34];
  const V = {
    F: [-.44, 0, 0], K: [.44, 0, 0], T: [0, .1, 0], B: [0, -.38, 0], Sp: [0, -.07, .19], Sm: [0, -.07, -.19],
    Na: [-.08, -.33, 0], Nc: [-.42, .02, 0], Np: [-.40, -.08, .07], Nm: [-.40, -.08, -.07], Nt: [-.96, .66, 0], Hd: [-1.13, .52, 0], Hp: [-1.0, .6, .04], Hm: [-1.0, .6, -.04],
    Ta: [.08, -.33, 0], Tc: [.42, .02, 0], Tp: [.40, -.08, .07], Tm: [.40, -.08, -.07], Tt: [1.02, .72, 0],
    Rf: [-.34, .06, 0], Rb: [.34, .06, 0],
  };
  const tris = [];
  const add = (a, b, c, col, flap = 0) => tris.push({ a: V[a] || a, b: V[b] || b, c: V[c] || c, col, flap });
  for (const s of ['Sp', 'Sm']) {
    add('F', 'T', s, CREAM); add('T', 'K', s, CREAM2); add('K', 'B', s, CREAM); add('B', 'F', s, CREAM2);
  }
  // neck and tail: slender kites, folded along their spine (two facets each side)
  add('Na', 'Np', 'Nt', CREAM); add('Np', 'Nc', 'Nt', CREAM2); add('Na', 'Nt', 'Nm', CREAM2); add('Nm', 'Nt', 'Nc', CREAM);
  add('Nt', 'Hd', 'Hp', CREAM2); add('Nt', 'Hm', 'Hd', CREAM);
  add('Ta', 'Tt', 'Tp', CREAM2); add('Tp', 'Tt', 'Tc', CREAM); add('Ta', 'Tm', 'Tt', CREAM); add('Tm', 'Tc', 'Tt', CREAM2);
  // wings: broad triangles raised in a V, a valley fold along each
  for (const sg of [1, -1]) {
    const Wt = [.18, .78, 1.02 * sg], Wm = [-.02, .40, .52 * sg], Wf = [-.40, .26, .42 * sg], Wb = [.44, .30, .40 * sg];
    add('Rf', Wm, Wt, RED, 2 * sg); add('Rb', Wt, Wm, RED3, 2 * sg); add('Rf', 'Rb', Wm, RED2, 1 * sg); add('Rf', Wf, Wm, RED2, 1 * sg); add('Rb', Wm, Wb, RED3, 1 * sg); add(Wb, Wm, Wt, RED, 2 * sg);
  }
  const P = [], N = [], C = [], B = [];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const t of tris) {
    let n = cross(sub(t.b, t.a), sub(t.c, t.a)); const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
    const bs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    [t.a, t.b, t.c].forEach((p, i) => { P.push(...p); N.push(...n); C.push(...t.col); B.push(...bs[i], t.flap); });
  }
  return { P: new Float32Array(P), N: new Float32Array(N), C: new Float32Array(C), B: new Float32Array(B), n: tris.length * 3 };
}

const mul = (a, b) => { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; };
const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); };
const rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
const ry = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
const rz = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };
const tr = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const sc = (s) => new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);

export function createCrane(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, depth: true, preserveDrawingBuffer: false });
  if (!gl) return null;
  const quad = quadBuffer(gl);
  gl.bindVertexArray(quad);
  const fib = bakeFibre(gl, 512);
  const pr = program(gl, VS, FS);
  const shp = program(gl, VS_SH, FS_SH);
  const m = craneMesh();
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  [[m.P, 3], [m.N, 3], [m.C, 3], [m.B, 4]].forEach(([d, k], i) => {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, k, gl.FLOAT, false, 0, 0);
  });
  gl.bindVertexArray(null);
  let draws = 0;
  function resize(w, h, dpr) {
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  }
  // s: { yaw, pitch, roll, bob, flap, scale, cx, cy }
  function render(s) {
    draws++;
    const W = canvas.width, H = canvas.height;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // shadow on the wall below (wider and fainter as the crane rises)
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.DEPTH_TEST);
    gl.useProgram(shp.p); gl.bindVertexArray(quad);
    const rise = s.bob;
    gl.uniform4f(shp.U('uBox'), (s.cx || 0) + .02, -.66 + (s.shy || 0), 1.15 * (1 + rise * .8), .16 * (1 + rise * .6));
    gl.uniform1f(shp.U('uA'), .42 * (1 - rise * 1.2));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.uniform4f(shp.U('uBox'), (s.cx || 0) + .02, -.68 + (s.shy || 0), .55 * (1 + rise * .5), .06 * (1 + rise * .4));
    gl.uniform1f(shp.U('uA'), .25 * (1 - rise * 1.6));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
    // the crane
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    const P = persp(.5, W / H, .5, 20);
    const eye = [0, 0, 5.2];
    const model = mul(tr(s.cx || 0, .08 + rise * .28 + (s.cy || 0), 0), mul(rx(s.pitch), mul(ry(s.yaw), mul(rz(s.roll), sc(s.scale || 1)))));
    const view = tr(0, 0, -eye[2]);
    const mvp = mul(P, mul(view, model));
    gl.useProgram(pr.p); gl.bindVertexArray(vao);
    gl.uniformMatrix4fv(pr.U('uMVP'), false, mvp); gl.uniformMatrix4fv(pr.U('uM'), false, model);
    gl.uniform1f(pr.U('uFlap'), s.flap);
    gl.uniform3f(pr.U('uL'), -.5, .62, .6); gl.uniform3f(pr.U('uEye'), eye[0], eye[1], eye[2]);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fib); gl.uniform1i(pr.U('uFib'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, m.n);
    gl.bindVertexArray(quad);
    gl.disable(gl.DEPTH_TEST);
  }
  return { gl, resize, render, get draws() { return draws; }, lose() { const e = gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); return e; } };
}
