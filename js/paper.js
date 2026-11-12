// DV70 ORIGAMI FAQ · WebGL2 paper renderer (one canvas behind the FAQ list, drawn only when something moves).
//   bake     a tileable cotton-rag fibre sheet (formation, relief slope, fibres, linen flecks), once per context
//   shadow   every sheet projected along the window light onto the wall, half CSS res, two separable blurs (soft + contact)
//   paper    question cards (fibre card stock, dog-ear, navy dye) and the concertina answer panels (creases, valley shade,
//            ridge highlights, deckled edges, translucency, crane watermark), lit by the same window-blind light as the wall
// World = the list's CSS px (x right, y down, z towards the viewer). The projection is the CSS one (perspective F, origin O),
// so app.js can place the DOM text on each panel with a matrix3d that matches the GL mesh exactly.

const VS_FULL = `#version 300 es
layout(location=0) in vec2 a;
out vec2 vUv;
void main(){ vUv = a; gl_Position = vec4(a*2.-1., 0., 1.); }`;

const NOISE = `
float hash(vec2 p){ p = fract(p*vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y)*p.x); }
float pn(vec2 p, vec2 per){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  float a = hash(mod(i, per)), b = hash(mod(i + vec2(1, 0), per)), c = hash(mod(i + vec2(0, 1), per)), d = hash(mod(i + vec2(1, 1), per));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
`;

// ---------- fibre bake: r formation/albedo · g,b relief slope · a fibres (0.5 = none, >0.5 light strand, <0.5 dark fleck)
const FS_BAKE = `#version 300 es
precision highp float;
uniform vec2 uRes; out vec4 o;
${NOISE}
float fbm(vec2 uv, float base){ float s = 0., a = .5, per = base; for (int k = 0; k < 6; k++){ s += a*pn(uv*per, vec2(per)); per *= 2.; a *= .5; } return s; }
// short curved fibres scattered on a tiled grid: distance to a segment per cell (3x3 neighbourhood)
float fibres(vec2 uv, float cells, float seed, float len, float wid){
  vec2 g = uv*cells; vec2 i0 = floor(g); float best = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 c = i0 + vec2(x, y); vec2 cw = mod(c, cells);
    float h1 = hash(cw + seed), h2 = hash(cw + seed + 7.3), h3 = hash(cw + seed + 13.1);
    vec2 ctr = c + vec2(h1, h2);
    float ang = h3*6.2832; vec2 d = vec2(cos(ang), sin(ang));
    vec2 q = g - ctr; float t = clamp(dot(q, d), -len, len);
    vec2 perp = q - d*t; perp -= vec2(-d.y, d.x)*(t*t)*.18*(h1 - .5); // gentle curl
    float dist = length(perp);
    float k = (1. - smoothstep(wid*.4, wid, dist))*(1. - smoothstep(len*.7, len, abs(t)));
    best = max(best, k*(.55 + .45*h2));
  }
  return best; }
float height(vec2 uv){ return .5*fbm(uv, 8.) + .35*fbm(uv + .37, 64.) + .18*fibres(uv, 96., 1., .9, .10) + .10*fibres(uv, 150., 5., .8, .10); }
void main(){
  vec2 uv = gl_FragCoord.xy/uRes; float e = 1./uRes.x;
  float hx = height(uv + vec2(e, 0.)) - height(uv - vec2(e, 0.));
  float hy = height(uv + vec2(0., e)) - height(uv - vec2(0., e));
  float form = fbm(uv + 1.7, 4.)*.7 + fbm(uv + 4.1, 16.)*.3;          // cloudy formation of a hand-pulled sheet
  float light = fibres(uv, 120., 3., 1.0, .09);                        // fine pale cotton strands
  float longf = fibres(uv, 44., 11., 1.3, .045);                       // a few longer, fainter ones
  float dark = fibres(uv, 70., 9., .3, .16)*step(.94, hash(floor(uv*70.) + 2.));   // sparse linen flecks
  float a = .5 + .28*light + .16*longf - .5*dark;
  o = vec4(.5 + (form - .5)*1.1, .5 + hx*5., .5 + hy*5., clamp(a, 0., 1.));
}`;

// ---------- shared paper lighting (window light from the upper left, blind stripes, sky fill)
const LIGHT = `
uniform vec3 uL; uniform vec2 uGoboOff; uniform vec4 uGobo, uGoboMask; uniform float uZw;
// the window-blind pattern on the wall plane, in page px (same formula as the CSS wall in app.js)
float gobo(vec2 pg){
  float t = dot(pg, uGobo.xy)/uGobo.z;
  float f = fract(t);
  float band = smoothstep(.0, .22, f)*(1. - smoothstep(.40, .66, f));
  vec2 r = (pg - uGoboMask.xy)/uGoboMask.zw;
  float m = .25 + .75*max(0., 1. - dot(r, r));
  return 1. - uGobo.w*band*m;
}
uniform vec4 uSun;
float sunAt(vec3 w){ vec2 r = (uGoboOff + w.xy - uSun.xy)/uSun.zw; return .84 + .22*exp(-dot(r, r)*1.6); }
float goboAt(vec3 w){ float h = w.z*.35 + uZw; return gobo(uGoboOff + w.xy - h*uL.xy/uL.z); }
`;

// ---------- shadow pass: geometry squashed onto the wall along the light, written as coverage
const VS_SHADOW = `#version 300 es
layout(location=0) in vec2 a;
uniform vec2 uRes, uO, uM; uniform float uF;
uniform vec3 uL; uniform float uZw;
uniform int uKind;                 // 0 card, 1 panel
uniform vec4 uRect;                // card: x0, y0, w, h · panel: x0, w, -, -
uniform vec4 uSeg;                 // panel: y0, z0, y1, z1
uniform float uZ;
out float vH;
void main(){
  vec3 p;
  if (uKind == 0) p = vec3(uRect.x + a.x*uRect.z, uRect.y + a.y*uRect.w, uZ);
  else p = vec3(uRect.x + a.x*uRect.y, mix(uSeg.x, uSeg.z, a.y), mix(uSeg.y, uSeg.w, a.y));
  float h = max(p.z + uZw, .5);
  vec2 s = p.xy - h*uL.xy/uL.z;
  vec3 w = vec3(s, -uZw);
  float ww = 1. - w.z/uF; vec2 scr = uO + (w.xy - uO)/ww + uM;
  vH = h;
  gl_Position = vec4(scr.x/uRes.x*2. - 1., 1. - scr.y/uRes.y*2., 0., 1.);
}`;
const FS_SHADOW = `#version 300 es
precision mediump float;
in float vH; uniform float uA; out vec4 o;
void main(){ o = vec4(uA, uA*exp(-(vH - 10.)/7.), 0., 1.); }`;

const FS_BLUR = `#version 300 es
precision mediump float;
in vec2 vUv; uniform sampler2D uT; uniform vec2 uDir; out vec4 o;
void main(){
  // soft (r): wide gaussian · contact (g): tight gaussian
  float w[5] = float[5](.2270, .1946, .1216, .0541, .0162);
  vec2 c = texture(uT, vUv).rg; float r = c.r*w[0], g = c.g*w[0];
  for (int i = 1; i < 5; i++){
    float fi = float(i);
    r += (texture(uT, vUv + uDir*fi*2.8).r + texture(uT, vUv - uDir*fi*2.8).r)*w[i];
    g += (texture(uT, vUv + uDir*fi*.55).g + texture(uT, vUv - uDir*fi*.55).g)*w[i];
  }
  o = vec4(r, g, 0., 1.);
}`;
const FS_SHCOMP = `#version 300 es
precision mediump float;
in vec2 vUv; uniform sampler2D uT; uniform vec2 uK; out vec4 o;
void main(){ vec2 c = texture(uT, vUv).rg; float a = clamp(uK.x*c.r + uK.y*c.g, 0., .8); o = vec4(vec3(.24, .16, .08)*a, a); }`;

// ---------- the paper (cards + panels share one vertex shader)
const VS_PAPER = `#version 300 es
layout(location=0) in vec2 a;
uniform vec2 uRes, uO, uM; uniform float uF;
uniform int uKind;
uniform vec4 uRect;   // card: x0, y0, w, h · panel: x0, w, Hp, sheetY0
uniform vec4 uSeg;    // panel: y0, z0, y1, z1
uniform vec2 uBow;    // panel: bow px, sin(beta)
uniform float uZ;     // card lift
out vec3 vW; out vec3 vN; out vec2 vP; out vec3 vTv;
void main(){
  vec3 p; vec3 n; vec3 tv;
  if (uKind == 0){
    p = vec3(uRect.x + a.x*uRect.z, uRect.y + a.y*uRect.w, uZ);
    n = vec3(0., 0., 1.); tv = vec3(0., 1., 0.);
    vP = vec2(a.x*uRect.z, a.y*uRect.w);
  } else {
    vec2 d = vec2(uSeg.z - uSeg.x, uSeg.w - uSeg.y); float L = max(length(d), 1e-4); vec2 dn = d/L;
    tv = vec3(0., dn);                               // along the panel (down the sheet)
    n = normalize(vec3(0., -dn.y, dn.x));             // towards the viewer for a vertical panel
    float t = a.y;
    float bow = uBow.x*sin(3.14159265*t)*(1. - .35*cos(6.2832*a.x));
    p = vec3(uRect.x + a.x*uRect.y, mix(uSeg.x, uSeg.z, t), mix(uSeg.y, uSeg.w, t)) + n*bow;
    // the bow tilts the normal along the panel
    float db = uBow.x*3.14159265*cos(3.14159265*t)/max(uRect.z, 1.)*(1. - .35*cos(6.2832*a.x));
    n = normalize(n - tv*db);
    vP = vec2(a.x*uRect.y, uRect.w + t*uRect.z);
  }
  vW = p; vN = n; vTv = tv;
  float ww = 1. - p.z/uF; vec2 scr = uO + (p.xy - uO)/ww + uM;
  gl_Position = vec4((scr.x/uRes.x*2. - 1.)*ww, (1. - scr.y/uRes.y*2.)*ww, (-p.z/1500.)*ww, ww);
}`;

const FS_PAPER = `#version 300 es
precision highp float; precision highp int;
in vec3 vW; in vec3 vN; in vec2 vP; in vec3 vTv;
uniform vec2 uO; uniform float uF;
uniform int uKind;
uniform vec4 uRect;
uniform sampler2D uFib;
uniform float uSeed, uAlpha;
// card
uniform float uNavy, uHover, uDog, uPress; uniform vec2 uPtr;
// panel
uniform vec4 uCrease;   // top: kind (0 hinge, 1 valley, 2 ridge) · bottom kind · top bend (rad) · bottom bend
uniform vec3 uNPrev, uNNext; uniform float uMark; uniform vec2 uMarkPos; uniform float uRestTilt, uLast, uShadeTop, uSg, uShTilt;
${LIGHT}
${NOISE}
out vec4 o;
float sdTri(vec2 p, vec2 a, vec2 b, vec2 c){
  vec2 e0 = b - a, e1 = c - b, e2 = a - c, v0 = p - a, v1 = p - b, v2 = p - c;
  vec2 pq0 = v0 - e0*clamp(dot(v0, e0)/dot(e0, e0), 0., 1.);
  vec2 pq1 = v1 - e1*clamp(dot(v1, e1)/dot(e1, e1), 0., 1.);
  vec2 pq2 = v2 - e2*clamp(dot(v2, e2)/dot(e2, e2), 0., 1.);
  float s = sign(e0.x*e2.y - e0.y*e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s*(v0.x*e0.y - v0.y*e0.x)), vec2(dot(pq1, pq1), s*(v1.x*e1.y - v1.y*e1.x))), vec2(dot(pq2, pq2), s*(v2.x*e2.y - v2.y*e2.x)));
  return -sqrt(d.x)*sign(d.y);
}
// a crane in profile (the mill's watermark), as a union of triangles, in a 100-unit box
float craneSd(vec2 p){
  float d = sdTri(p, vec2(8., 52.), vec2(50., 44.), vec2(44., 62.));      // body + tail
  d = min(d, sdTri(p, vec2(44., 62.), vec2(92., 50.), vec2(58., 46.)));
  d = min(d, sdTri(p, vec2(30., 50.), vec2(64., 6.), vec2(56., 50.)));     // raised wing
  d = min(d, sdTri(p, vec2(46., 50.), vec2(30., 26.), vec2(56., 48.)));
  d = min(d, sdTri(p, vec2(86., 52.), vec2(96., 22.), vec2(90., 52.)));    // neck
  d = min(d, sdTri(p, vec2(94., 22.), vec2(100., 26.), vec2(95., 27.)));   // head
  d = min(d, sdTri(p, vec2(10., 54.), vec2(2., 30.), vec2(14., 52.)));     // tail point
  return d;
}
void main(){
  vec3 V = normalize(vec3(uO, uF) - vW);
  vec3 N = normalize(vN);
  bool back = dot(N, V) < 0.;
  vec3 n = back ? -N : N;
  vec2 sp = vP;                                   // paper px on the sheet
  vec4 fb = texture(uFib, (sp + uSeed*vec2(173., 91.))/640.);
  vec4 fb2 = texture(uFib, (sp + uSeed*vec2(57., 211.))/1700.);
  float cov = 1.;
  vec3 alb;
  float crease = 0., ao = 0., edge = 0., shTop = 0.;
  float transm = .0;
  vec3 tx = vec3(1., 0., 0.), ty = normalize(cross(n, tx));

  if (uKind == 0){
    // ---- question card: heavy cotton card
    float W = uRect.z, H = uRect.w;
    float fw = max(fwidth(sp.x), 1e-3);
    // dog-ear: the corner is folded down along (W - x) + y = d
    float dg = uDog;
    float diag = (W - sp.x) + sp.y;                       // < dg: the corner that is folded away
    if (diag < dg - .7) discard;
    float onCorner = 1. - smoothstep(dg - .7, dg + .7, diag);
    cov = 1. - onCorner*0.;
    vec3 base = vec3(.968, .955, .930);
    vec3 navy = vec3(.135, .175, .305);
    alb = mix(base, navy, uNavy);
    // fibre: formation + strands + flecks (gold inclusions in the navy dye)
    float strand = fb.a - .5;
    alb *= .985 + .05*(fb.r - .5) + .03*(fb2.r - .5);
    alb += mix(vec3(.022, .020, .015), vec3(.03, .035, .05), uNavy)*strand;
    float gold = smoothstep(.25, .08, fb.a)*uNavy;
    alb = mix(alb, vec3(.80, .64, .36), gold*.8);
    alb = mix(alb, alb*vec3(.82, .79, .74), smoothstep(.40, .15, fb.a)*(1. - uNavy)*.35);
    // micro relief + a soft bow across the card
    vec2 rel = vec2(fb.g - .5, fb.b - .5);
    n = normalize(n + (tx*rel.x + ty*rel.y)*mix(.05, .04, uNavy) + tx*(.022*(sp.x/W - .5)) + ty*(.03*(sp.y/H - .5)));
    // the folded flap: triangle (W-dg,0) (W,dg) (W-dg,dg), lying on the card, its back side up
    vec2 A = vec2(W - dg, 0.), B = vec2(W, dg), C = vec2(W - dg, dg);
    float df = sdTri(sp, A, B, C);
    float flap = 1. - smoothstep(-.6, .6, df);
    // flap shadow on the card (offset down-right from the light)
    float fs = sdTri(sp - vec2(1.6, 2.2), A, B, C);
    float flapSh = (1. - smoothstep(-1., 4.5, fs))*(1. - flap);
    // edges: a bright top lip and a darker lower edge (card thickness)
    float eT = sp.y, eB = H - sp.y, eL = sp.x, eR = W - sp.x;
    edge = .07*exp(-eT/1.2) - .09*exp(-eB/1.5) + .03*exp(-eL/1.2) - .04*exp(-eR/1.4);
    if (flap > .5){
      // paper back (cream even on the navy card: dyed one side), creased edge lit
      alb = vec3(.90, .875, .83)*(.98 + .04*(fb.r - .5));
      n = normalize(vec3(-.18, -.22, 1.));
      float fe = -df; edge = .06*exp(-fe/1.0);
    }
    vec3 L = normalize(uL);
    float g = goboAt(vW);
    float ndl = dot(n, L);
    float diff = clamp((ndl + .25)/1.25, 0., 1.);
    float sky = .47 + .10*n.z - .08*n.y;
    vec3 col = alb*(sky + .45*diff*g*sunAt(vW));
    // soft paper sheen (stronger on the dyed, calendered card), follows the pointer when hovering
    vec3 H2 = normalize(L + V);
    float spec = pow(max(dot(n, H2), 0.), 14.);
    col += vec3(1., .97, .9)*spec*mix(.035, .07, uNavy)*g;
    vec2 pd = (sp - uPtr)/vec2(W*.55, H*1.6);
    col += vec3(1., .98, .93)*uHover*.05*exp(-dot(pd, pd))*(1. - .5*uNavy);
    col *= 1. - flapSh*.22;
    col += edge;
    col *= 1. - uPress*.025;
    col = max(col, 0.);
    o = vec4(col*uAlpha, uAlpha);
    return;
  }

  // ---- concertina panel
  float W = uRect.y, Hp = uRect.z;
  float v = sp.y - uRect.w;                       // 0..Hp inside this panel
  // deckled side edges: irregular, feathered
  float dl = 1.8 + 1.6*pn(vec2(sp.y*.09, uSeed), vec2(1e4)) + .9*pn(vec2(sp.y*.5, uSeed + 3.), vec2(1e4)) + 1.2*(fb.r - .5);
  float dr = 1.8 + 1.6*pn(vec2(sp.y*.09, uSeed + 9.), vec2(1e4)) + .9*pn(vec2(sp.y*.5, uSeed + 5.), vec2(1e4)) + 1.2*(fb2.r - .5);
  float fw = max(fwidth(sp.x), 1e-3);
  float ed = min(sp.x - dl, W - sp.x - dr);
  cov = clamp(ed/fw + .5, 0., 1.);
  if (cov <= .003) discard;
  float feather = 1. - smoothstep(0., 3.5, ed);   // thinner fibre mat at the deckle
  // rounded creases: blend towards the neighbour's normal over a couple of px
  float rTop = 2.2 + 2.2*abs(uCrease.z), rBot = 2.2 + 2.2*abs(uCrease.w);
  vec3 nP = back ? -uNPrev : uNPrev, nN = back ? -uNNext : uNNext;
  float prof = .35 + .65*pow(abs(v/Hp - .5)*2., 2.);          // a relaxed sheet keeps more angle near its creases
  n = normalize(n + vec3(0., -uSg*uShTilt*prof, 0.)); nP = normalize(nP + vec3(0., uSg*uShTilt, 0.)); nN = normalize(nN + vec3(0., uSg*uShTilt, 0.));
  float wt = .5*(1. - smoothstep(0., rTop, v))*step(.5, uCrease.x);
  float wb = .5*(1. - smoothstep(0., rBot, Hp - v))*(1. - uLast);
  n = normalize(n*(1. - wt - wb) + nP*wt + nN*wb);
  // residual crease memory when the sheet is opened flat: alternate facets keep a faint tilt, creases stay visible
  float facet = mod(floor(sp.y/Hp + .5), 2.) < .5 ? 1. : -1.;
  vec3 tv = normalize(vTv);
  n = normalize(n + tv*uRestTilt*(v < Hp*.5 ? 1. : 1.)*0.);
  // relief + gentle cockle of a hand-pulled sheet
  vec2 rel = vec2(fb.g - .5, fb.b - .5);
  vec3 bx = vec3(1., 0., 0.), by = normalize(cross(n, bx));
  float ck = .018*sin(sp.x*.021 + uSeed*3.1 + sp.y*.008) + .012*sin(sp.y*.035 - sp.x*.006 + uSeed);
  n = normalize(n + (bx*rel.x + by*rel.y)*.06 + by*ck + bx*.01*sin(sp.y*.05 + uSeed));
  // albedo: warm cotton rag
  alb = vec3(.972, .958, .932);
  alb *= .982 + .06*(fb.r - .5) + .035*(fb2.r - .5);
  float strand = fb.a - .5;
  alb += vec3(.024, .021, .016)*strand;
  alb = mix(alb, alb*vec3(.80, .76, .70), smoothstep(.40, .15, fb.a)*.45);
  if (back) alb *= vec3(.975, .968, .955);
  // crease lines: crushed fibre on a ridge (bright hairline), a dark hairline + occlusion in a valley
  float dT = v, dB = Hp - v;
  float bendT = abs(uCrease.z), bendB = abs(uCrease.w);
  float ridgeT = step(1.5, uCrease.x), ridgeB = step(1.5, uCrease.y)*(1. - uLast);
  float valT = step(.5, uCrease.x)*(1. - ridgeT), valB = step(.5, uCrease.y)*(1. - step(1.5, uCrease.y))*(1. - uLast);
  float lineT = exp(-dT/.8), lineB = exp(-dB/.8);
  float memory = 1.;                                           // creases never fully disappear
  crease += (ridgeT*lineT + ridgeB*lineB)*(memory*.9 + .9*max(bendT, bendB));
  crease -= (valT*lineT + valB*lineB)*(memory*.9 + 1.1*max(bendT, bendB));
  ao += valT*(sin(bendT))*exp(-dT/(Hp*.28))*.42 + valB*sin(bendB)*exp(-dB/(Hp*.28))*.42;
  // the card's lip shades the top of the first panel
  shTop = uShadeTop*exp(-v/7.)*.28;

  vec3 L = normalize(uL);
  float g = goboAt(vW);
  float ndl = dot(n, L);
  float diff = clamp((ndl + .25)/1.25, 0., 1.);
  float sky = .47 + .12*n.z - .1*n.y;
  vec3 col = alb*(sky + .45*diff*g*sunAt(vW));
  // translucency: light through the sheet where it faces away from the window, brighter in the thin watermark
  float wm = 0.;
  if (uMark > .5){
    vec2 mp = (sp - uMarkPos)/1.15;
    float sd = craneSd(mp);
    wm = (1. - smoothstep(-.8, 1.4, sd))*(.75 + .25*fb.r);
  }
  float through = clamp(-ndl, 0., 1.)*g;
  col += vec3(1., .93, .78)*(through*(.10 + .30*wm) + feather*.03);
  col += vec3(.020, .018, .012)*wm - vec3(.010, .012, .016)*wm*(1. - through);
  // a faint sheen
  vec3 H2 = normalize(L + V);
  col += vec3(1., .97, .9)*pow(max(dot(n, H2), 0.), 10.)*.03*g;
  col *= 1. - ao - shTop;
  col += crease*.055;
  col *= 1. - feather*.04;
  float a = cov*uAlpha*(1. - feather*.12);
  o = vec4(max(col, 0.)*a, a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); throw new Error('shader: ' + log); }
  return s;
}
export function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const cache = {};
  const U = (n) => (n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n)));
  return { p, U };
}
export function bakeFibre(gl, size = 1024) {
  const pr = program(gl, VS_FULL, FS_BAKE);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.viewport(0, 0, size, size); gl.useProgram(pr.p); gl.uniform2f(pr.U('uRes'), size, size);
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb);
  gl.bindTexture(gl.TEXTURE_2D, tex); gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.deleteProgram(pr.p);
  return tex;
}
export function quadBuffer(gl) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}
function gridBuffer(gl, nx, ny) {
  const v = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x0 = i / nx, x1 = (i + 1) / nx, y0 = j / ny, y1 = (j + 1) / ny;
    v.push(x0, y0, x1, y0, x1, y1, x0, y0, x1, y1, x0, y1);
  }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, n: v.length / 2 };
}

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, depth: true, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) return null;
  const quad = quadBuffer(gl);
  gl.bindVertexArray(quad);
  const fib = bakeFibre(gl);
  const P = program(gl, VS_PAPER, FS_PAPER);
  const SH = program(gl, VS_SHADOW, FS_SHADOW);
  const BL = program(gl, VS_FULL, FS_BLUR);
  const SC = program(gl, VS_FULL, FS_SHCOMP);
  const panelGrid = gridBuffer(gl, 24, 6);
  const cardGrid = gridBuffer(gl, 4, 2);
  const rt = [0, 1].map(() => ({ tex: gl.createTexture(), fb: gl.createFramebuffer() }));
  let sw = 0, sh = 0;
  const G = { cw: 1, ch: 1, dpr: 1, M: 0 };
  let draws = 0;

  function resize(cssW, cssH, dpr, M) {
    G.cw = cssW; G.ch = cssH; G.dpr = dpr; G.M = M;
    const w = Math.max(1, Math.round(cssW * dpr)), h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const nsw = Math.max(1, Math.round(cssW / 2)), nsh = Math.max(1, Math.round(cssH / 2));
    if (nsw !== sw || nsh !== sh) {
      sw = nsw; sh = nsh;
      for (const r of rt) {
        gl.bindTexture(gl.TEXTURE_2D, r.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, sw, sh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, r.fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.tex, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  function common(pr, S) {
    gl.uniform2f(pr.U('uRes'), G.cw, G.ch);
    gl.uniform2f(pr.U('uO'), S.O[0], S.O[1]);
    gl.uniform2f(pr.U('uM'), G.M, G.M);
    gl.uniform1f(pr.U('uF'), S.F);
    gl.uniform3f(pr.U('uL'), S.L[0], S.L[1], S.L[2]);
    gl.uniform1f(pr.U('uZw'), S.Zw);
  }

  // S: { O, F, L, Zw, gobo:[dx,dy,period,strength], goboOff:[x,y], cards:[...], panels:[...], shadowK }
  // band: [y0, y1] in world px — only that strip of the canvas is repainted (the rest keeps its pixels)
  function render(S, band) {
    draws++;
    // ---- shadow pass (half CSS res)
    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt[0].fb); gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(SH.p); common(SH, S);
    gl.bindVertexArray(cardGrid.vao);
    gl.uniform1i(SH.U('uKind'), 0);
    for (const c of S.cards) {
      gl.uniform4f(SH.U('uRect'), c.x, c.y, c.w, c.h); gl.uniform1f(SH.U('uZ'), c.z); gl.uniform1f(SH.U('uA'), c.alpha * .95);
      gl.drawArrays(gl.TRIANGLES, 0, cardGrid.n);
    }
    gl.uniform1i(SH.U('uKind'), 1);
    for (const p of S.panels) {
      gl.uniform2f(SH.U('uO'), p.O[0], p.O[1]);
      gl.uniform4f(SH.U('uRect'), p.x, p.w, p.h, 0); gl.uniform4f(SH.U('uSeg'), p.y0, p.z0, p.y1, p.z1); gl.uniform1f(SH.U('uA'), p.alpha * .8);
      gl.drawArrays(gl.TRIANGLES, 0, cardGrid.n);
    }
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(quad);
    gl.useProgram(BL.p); gl.activeTexture(gl.TEXTURE1); gl.uniform1i(BL.U('uT'), 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt[1].fb); gl.bindTexture(gl.TEXTURE_2D, rt[0].tex);
    gl.uniform2f(BL.U('uDir'), 1 / sw, 0); gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt[0].fb); gl.bindTexture(gl.TEXTURE_2D, rt[1].tex);
    gl.uniform2f(BL.U('uDir'), 0, 1 / sh); gl.drawArrays(gl.TRIANGLES, 0, 6);

    // ---- main pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
    if (band) {
      const d = G.dpr, top = Math.max(0, Math.floor((band[0] + G.M) * d)), bot = Math.min(canvas.height, Math.ceil((band[1] + G.M) * d));
      gl.enable(gl.SCISSOR_TEST); gl.scissor(0, canvas.height - bot, canvas.width, Math.max(0, bot - top));
    }
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(SC.p); gl.uniform1i(SC.U('uT'), 1); gl.bindTexture(gl.TEXTURE_2D, rt[0].tex);
    gl.uniform2f(SC.U('uK'), S.shadowK[0], S.shadowK[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.useProgram(P.p); common(P, S);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fib); gl.uniform1i(P.U('uFib'), 0);
    gl.uniform4f(P.U('uGobo'), S.gobo[0], S.gobo[1], S.gobo[2], S.gobo[3]);
    gl.uniform2f(P.U('uGoboOff'), S.goboOff[0], S.goboOff[1]);
    gl.uniform4f(P.U('uGoboMask'), S.goboMask[0], S.goboMask[1], S.goboMask[2], S.goboMask[3]);
    gl.uniform4f(P.U('uSun'), S.sun[0], S.sun[1], S.sun[2], S.sun[3]);
    // panels first (they may hang in front of the next card), then cards
    gl.bindVertexArray(panelGrid.vao);
    gl.uniform1i(P.U('uKind'), 1);
    for (const p of S.panels) {
      gl.uniform2f(P.U('uO'), p.O[0], p.O[1]);
      gl.uniform4f(P.U('uRect'), p.x, p.w, p.h, p.sy);
      gl.uniform4f(P.U('uSeg'), p.y0, p.z0, p.y1, p.z1);
      gl.uniform2f(P.U('uBow'), p.bow, 0);
      gl.uniform4f(P.U('uCrease'), p.ct, p.cb, p.bt, p.bb);
      gl.uniform3f(P.U('uNPrev'), 0, p.np[0], p.np[1]);
      gl.uniform3f(P.U('uNNext'), 0, p.nn[0], p.nn[1]);
      gl.uniform1f(P.U('uMark'), p.mark ? 1 : 0); gl.uniform2f(P.U('uMarkPos'), p.markPos[0], p.markPos[1]);
      gl.uniform1f(P.U('uRestTilt'), 0); gl.uniform1f(P.U('uLast'), p.last ? 1 : 0); gl.uniform1f(P.U('uShadeTop'), p.k === 0 ? 1 : 0);
      gl.uniform1f(P.U('uSg'), p.sg); gl.uniform1f(P.U('uShTilt'), p.tilt);
      gl.uniform1f(P.U('uSeed'), p.seed); gl.uniform1f(P.U('uAlpha'), p.alpha);
      gl.drawArrays(gl.TRIANGLES, 0, panelGrid.n);
    }
    gl.bindVertexArray(cardGrid.vao);
    gl.uniform2f(P.U('uO'), S.O[0], S.O[1]);
    gl.uniform1i(P.U('uKind'), 0);
    for (const c of S.cards) {
      gl.uniform4f(P.U('uRect'), c.x, c.y, c.w, c.h); gl.uniform1f(P.U('uZ'), c.z);
      gl.uniform1f(P.U('uNavy'), c.navy); gl.uniform1f(P.U('uHover'), c.hover); gl.uniform1f(P.U('uPress'), c.press);
      gl.uniform1f(P.U('uDog'), c.dog); gl.uniform2f(P.U('uPtr'), c.ptr[0], c.ptr[1]);
      gl.uniform1f(P.U('uSeed'), c.seed); gl.uniform1f(P.U('uAlpha'), c.alpha);
      gl.drawArrays(gl.TRIANGLES, 0, cardGrid.n);
    }
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.bindVertexArray(quad);
  }
  return { gl, resize, render, get draws() { return draws; }, lose() { const e = gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); return e; } };
}
