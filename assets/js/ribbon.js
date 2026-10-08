// The telemetry ribbon: a liquid-glass ribbon in BluCaliper blues, the live
// stream the glass refracts. Vanilla WebGL 1, no libraries. Ported from the
// Stage 1 board (Koop Solutions style, rebuilt in BluCaliper blues).
//
//   const r = createRibbon(canvas, { palette: 'overnight', energy: 1 });
//   r.setEnergy(1.9)   // rises while a query runs; 1 at rest
//   r.setPalette('golden')
//   r.destroy()
//
// Declarative: <canvas class="ribbon" data-ribbon="overnight" aria-hidden="true"></canvas>
// (optional data-ribbon-energy, -look, -slope, -opacity). Created lazily near
// the viewport, paused offscreen and in hidden tabs, DPR capped at 2, one static
// frame under reduced motion, and a CSS gradient if WebGL is unavailable.
//
// Section 10's Sankey shares the material: use PALETTES / ribbonStops() for
// SVG gradients, or FRAGMENT for a WebGL pass of your own.
//
// Themes: on paper (html[data-theme="light"], outside a .stage band) every
// palette switches to its LIGHT twin: deeper blues at lower opacity, no white
// rim. A ribbon inside a .stage stays dark in both themes. A live ribbon
// follows the toggle by itself; ribbonStops(name, theme) takes the theme too.
import { loop as sharedLoop } from './loop.js';
import { themeOf, onTheme } from './theme.js';

export const PALETTES = {
  overnight: { a: [0.02, 0.30, 0.84], b: [0.16, 0.86, 1.0], rim: [0.62, 0.55, 1.0], op: 1.0 },
  daylight: { a: [0.0, 0.40, 0.88], b: [0.32, 0.78, 0.98], rim: [0.78, 0.90, 1.0], op: 0.9 },
  golden: { a: [0.02, 0.30, 0.84], b: [0.98, 0.70, 0.30], rim: [1.0, 0.78, 0.45], op: 0.95 },
  dusk: { a: [0.10, 0.20, 0.70], b: [0.66, 0.55, 1.0], rim: [0.95, 0.55, 0.85], op: 0.95 },
};
/* On paper: deeper, quieter blues. Additive white would vanish on white, so the rim is a darker ink blue. */
export const PALETTES_LIGHT = {
  overnight: { a: [0.0, 0.20, 0.56], b: [0.0, 0.42, 0.78], rim: [0.10, 0.22, 0.55], op: 0.5 },
  daylight: { a: [0.0, 0.26, 0.64], b: [0.05, 0.47, 0.80], rim: [0.12, 0.28, 0.60], op: 0.48 },
  golden: { a: [0.0, 0.22, 0.58], b: [0.62, 0.40, 0.10], rim: [0.45, 0.30, 0.10], op: 0.5 },
  dusk: { a: [0.06, 0.14, 0.50], b: [0.36, 0.28, 0.66], rim: [0.40, 0.22, 0.50], op: 0.5 },
};
const pick = (name, theme) => (theme === 'light' ? PALETTES_LIGHT : PALETTES)[name] ?? (theme === 'light' ? PALETTES_LIGHT : PALETTES).overnight;
const hex = (c) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
/** SVG/CSS gradient stops that match the ribbon material: [{ offset, color, opacity }] */
export function ribbonStops(name = 'overnight', theme = themeOf(document.documentElement)) {
  const p = pick(name, theme);
  return [
    { offset: 0, color: hex(p.a), opacity: 0.0 },
    { offset: 0.12, color: hex(p.a), opacity: 0.55 },
    { offset: 0.6, color: hex(p.b), opacity: 0.75 },
    { offset: 0.88, color: hex(p.rim), opacity: 0.5 },
    { offset: 1, color: hex(p.rim), opacity: 0.0 },
  ];
}

/* 2D simplex noise: Ashima Arts / Stefan Gustavson, MIT license */
const NOISE = `vec3 permute(vec3 x){return mod(((x*34.0)+1.0)*x,289.0);}
float snoise(vec2 v){const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod(i,289.0);
vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);m=m*m;m=m*m;
vec3 x=2.0*fract(p*C.www)-1.0;vec3 h=abs(x)-0.5;vec3 ox=floor(x+0.5);vec3 a0=x-ox;
m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.0*dot(m,g);}
`;
export const VERTEX = NOISE + `
attribute vec2 aPos; attribute vec2 aUv;
uniform mat4 uPV; uniform float uT, uPhase, uAmp, uY, uZ, uSlope, uEn;
varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vH;
float surf(vec2 p, float t){
  return sin(p.x*0.28 + t*0.50 + uPhase + p.y*0.20)*0.55
       + sin(p.x*0.15 - t*0.33 + 1.7 + uPhase)*0.80
       + sin(p.x*0.50 + p.y*0.50 + t*0.75 + uPhase*2.0)*0.18*uEn
       + snoise(vec2(p.x*0.10 + t*0.05, p.y*0.30 + uPhase))*0.50;
}
void main(){
  vUv = aUv;
  float e = 0.12;
  float h = surf(aPos, uT), hx = surf(aPos + vec2(e, 0.0), uT), hz = surf(aPos + vec2(0.0, e), uT);
  float A = uAmp * (0.75 + 0.25 * uEn);
  vH = h * A;
  vec3 w = vec3(aPos.x, h * A + uY + aPos.x * uSlope, aPos.y + uZ);
  vN = normalize(vec3(-(hx - h) / e * A - uSlope, 1.0, -(hz - h) / e * A));
  vW = w;
  gl_Position = uPV * vec4(w, 1.0);
}`;
export const FRAGMENT = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float uOp; uniform vec3 uA, uB, uRim, uCam;
varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vH;
void main(){
  vec3 N = normalize(vN), V = normalize(uCam - vW);
  if (dot(N, V) < 0.0) N = -N;
  float g = clamp(vUv.x * 0.9 + vH * 0.25, 0.0, 1.0);
  vec3 base = mix(uA, uB, g) * (0.8 + 0.3 * clamp(vH + 0.4, 0.0, 1.0));
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.4);
  float s1 = pow(max(dot(reflect(-normalize(vec3(-0.4, 0.9, 0.5)), N), V), 0.0), 90.0);
  float s2 = pow(max(dot(reflect(-normalize(vec3(0.6, 0.5, 0.5)), N), V), 0.0), 50.0);
  vec3 col = base + fres * uRim * 0.6 + vec3(s1 * 0.9 + s2 * 0.4);
  float edge = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
  float ends = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
  float a = clamp(uOp * edge * ends * (0.5 + 0.45 * fres + 0.3 * (s1 + s2)), 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}`;

const persp = (f, a, n, fa) => { const t = 1 / Math.tan(f / 2), nf = 1 / (n - fa); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) * nf, -1, 0, 0, 2 * fa * n * nf, 0]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lookAt = (e, c, up) => { const z = norm(sub(e, c)), x = norm(cross(up, z)), y = cross(z, x); return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot3(x, e), -dot3(y, e), -dot3(z, e), 1]; };
const mul = (a, b) => { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let v = 0; for (let k = 0; k < 4; k++) v += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = v; } return o; };
const LAYERS = [{ ph: 0.0, amp: 0.55, y: -0.25, z: -1.4, op: 0.5 }, { ph: 2.1, amp: 0.72, y: 0.05, z: 0.0, op: 0.9 }, { ph: 4.2, amp: 0.45, y: 0.35, z: 1.2, op: 0.42 }];

export function createRibbon(canvas, opts = {}) {
  const cfg = { palette: 'overnight', energy: 1, look: 1.9, slope: 0.08, opacity: 1.15, t0: 3, speed: 0.9, reduced: false, loop: sharedLoop, ...opts };
  const api = { ok: false, setEnergy() {}, setPalette() {}, destroy() {}, frame() {} };
  const fallback = () => { canvas.classList.add('ribbon-static'); api.ok = false; };

  let gl = null;
  try { gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' }); } catch { /* no WebGL */ }
  if (!gl) { fallback(); return api; }
  let prog;
  try {
    const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERTEX)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('ribbon: static fallback,', e.message); fallback(); return api; }

  gl.useProgram(prog);
  const COLS = 160, ROWS = 24, XW = 17, ZD = 2.2, pos = [], uv = [], idx = [];
  for (let r = 0; r <= ROWS; r++) for (let c = 0; c <= COLS; c++) { const u = c / COLS, v = r / ROWS; pos.push(-XW + u * 2 * XW, -ZD + v * 2 * ZD); uv.push(u, v); }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const a = r * (COLS + 1) + c, b = a + 1, d = a + COLS + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
  const buffers = [];
  const attr = (data, name) => { const b = gl.createBuffer(); buffers.push(b); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); const loc = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); };
  attr(pos, 'aPos'); attr(uv, 'aUv');
  const ib = gl.createBuffer(); buffers.push(ib);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  const U = {}; ['uPV', 'uT', 'uPhase', 'uAmp', 'uY', 'uZ', 'uSlope', 'uEn', 'uOp', 'uA', 'uB', 'uRim', 'uCam'].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
  gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const eye = [0, 3.0, 11.5];
  // The palette follows the ground the canvas sits on (dark inside a .stage band).
  let palName = typeof cfg.palette === 'string' ? cfg.palette : null;
  let pal = palName ? pick(palName, themeOf(canvas)) : cfg.palette;
  const light = () => themeOf(canvas) === 'light';
  // Premultiplied "over" works on both grounds; on paper the light palette carries the change.
  const offTheme = onTheme(() => { if (palName) { pal = pick(palName, themeOf(canvas)); if (!stop) frame(); } });
  let t = cfg.t0, en = cfg.energy, enTarget = cfg.energy, stop = null, visible = false, dead = false;

  function frame() {
    if (dead || gl.isContextLost()) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(U.uPV, false, new Float32Array(mul(persp(0.62, w / h, 0.1, 100), lookAt(eye, [0, cfg.look, 0], [0, 1, 0]))));
    gl.uniform3fv(U.uCam, eye); gl.uniform3fv(U.uA, pal.a); gl.uniform3fv(U.uB, pal.b); gl.uniform3fv(U.uRim, pal.rim);
    gl.uniform1f(U.uT, t); gl.uniform1f(U.uSlope, cfg.slope); gl.uniform1f(U.uEn, en);
    for (const L of LAYERS) {
      gl.uniform1f(U.uPhase, L.ph); gl.uniform1f(U.uAmp, L.amp); gl.uniform1f(U.uY, L.y); gl.uniform1f(U.uZ, L.z);
      gl.uniform1f(U.uOp, L.op * pal.op * cfg.opacity);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    }
  }
  const step = (now, dt) => { t += dt * cfg.speed; en += (enTarget - en) * Math.min(1, dt * 3); frame(); };
  const start = () => { if (cfg.reduced) { frame(); return; } if (!stop) stop = cfg.loop.add(step); };
  const pause = () => { if (stop) { stop(); stop = null; } };

  const io = new IntersectionObserver((es) => { for (const e of es) { visible = e.isIntersecting; visible ? start() : pause(); } });
  io.observe(canvas);
  const ro = new ResizeObserver(() => { if (!stop) frame(); });
  ro.observe(canvas);
  const onLost = (e) => { e.preventDefault(); pause(); fallback(); };
  canvas.addEventListener('webglcontextlost', onLost);
  frame();

  Object.assign(api, {
    ok: true,
    frame,
    setEnergy(v) { enTarget = v; if (cfg.reduced || !stop) { en = v; frame(); } },
    setPalette(p) { if (typeof p === 'string') { palName = p; pal = pick(p, themeOf(canvas)); } else { palName = null; pal = p; } if (!stop) frame(); },
    get light() { return light(); },
    destroy() {
      dead = true; pause(); offTheme(); io.disconnect(); ro.disconnect(); canvas.removeEventListener('webglcontextlost', onLost);
      buffers.forEach((b) => gl.deleteBuffer(b)); gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  });
  return api;
}

/** Create a ribbon for every canvas[data-ribbon] under root, lazily near the viewport. */
export function initRibbons(root, ctx = {}) {
  const els = [...root.querySelectorAll('canvas[data-ribbon]')].filter((c) => !('_ribbon' in c));
  if (!els.length) return;
  const num = (v, d) => (v == null || v === '' ? d : Number(v));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const c = e.target, d = c.dataset;
      c._ribbon = createRibbon(c, {
        reduced: ctx.reduced, loop: ctx.loop, palette: d.ribbon || 'overnight',
        energy: num(d.ribbonEnergy, 1), look: num(d.ribbonLook, 1.9), slope: num(d.ribbonSlope, 0.08), opacity: num(d.ribbonOpacity, 1.15), t0: num(d.ribbonT0, 3),
      });
    }
  }, { rootMargin: '30% 0px' });
  for (const c of els) { c._ribbon = null; io.observe(c); }
}
