import * as THREE from 'three';

// All textures are generated procedurally at load time: no external image assets.

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Texture canvases are drawn on the CPU (willReadFrequently keeps Chrome from giving them a GPU canvas):
// they are drawn once and uploaded, and a phone's GPU canvases can hold far more memory than the pixels.
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

// Draws a layer onto ctx blurred by radius px, in one operation. Where the canvas filter is missing
// (Safari), it is softened instead by scaling the layer down and back up.
function blurOnto(ctx, layer, radius) {
  if (typeof ctx.filter === 'string') {
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(layer, 0, 0);
    ctx.filter = 'none';
    return;
  }
  const k = Math.max(1, Math.round(radius * 1.5));
  const [sc, sx] = canvas(Math.max(1, Math.round(layer.width / k)), Math.max(1, Math.round(layer.height / k)));
  sx.imageSmoothingQuality = 'high';
  sx.drawImage(layer, 0, 0, sc.width, sc.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sc, 0, 0, layer.width, layer.height);
}

function toTexture(c, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// Smooth value noise for grain and mottling.
function makeNoise(seed) {
  const r = rng(seed);
  const P = 256, g = new Float32Array(P * P);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x, y) => g[((y & (P - 1)) * P) + (x & (P - 1))];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbm(n, x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); a *= 0.5; f *= 2; }
  return s;
}

// Oak table: four planks running along x, with figure, rays and seams. Returns colour + roughness.
export function woodTextures(maxSize = 2048) {
  const W = Math.min(2048, maxSize), H = W / 2;
  const [c, ctx] = canvas(W, H);
  const [rc, rctx] = canvas(W / 2, H / 2);
  const img = ctx.createImageData(W, H);
  const rimg = rctx.createImageData(W / 2, H / 2);
  const n = makeNoise(7), n2 = makeNoise(19);
  const planks = 4;
  for (let y = 0; y < H; y++) {
    const pi = Math.floor(y / H * planks);
    const py = (y / H * planks) - pi;
    const shade = [1.0, 0.94, 1.03, 0.97][pi];
    for (let x = 0; x < W; x++) {
      const u = x / W * 6 + pi * 13.1, v = py * 2.2 + pi * 3.7;
      const warp = fbm(n, u * 0.6, v * 1.5, 3) * 3.0;
      const ring = Math.sin((v * 9 + warp * 4 + fbm(n2, u * 0.3, v, 2) * 2) * Math.PI);
      const grain = Math.pow(Math.abs(ring), 0.35);
      const fleck = fbm(n2, u * 14, v * 60, 2);
      let t = 0.55 + 0.25 * grain + 0.18 * (fleck - 0.5);
      // seam darkening
      const seam = Math.min(py, 1 - py);
      if (seam < 0.012) t *= 0.45 + seam / 0.012 * 0.55;
      t *= shade;
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, 168 * t + 40);
      img.data[i + 1] = Math.min(255, 112 * t + 26);
      img.data[i + 2] = Math.min(255, 66 * t + 14);
      img.data[i + 3] = 255;
      if ((x & 1) === 0 && (y & 1) === 0) {
        const j = ((y >> 1) * (W >> 1) + (x >> 1)) * 4;
        const r = 150 + (1 - grain) * 50 + (seam < 0.012 ? 50 : 0);
        rimg.data[j] = rimg.data[j + 1] = rimg.data[j + 2] = r; rimg.data[j + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  return { map: toTexture(c), roughnessMap: toTexture(rc, { srgb: false }) };
}

// Linen table runner: woven oatmeal with terracotta border stripes.
export function linenTexture() {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#e9dfcc';
  ctx.fillRect(0, 0, 512, 512);
  const r = rng(3);
  for (let i = 0; i < 512; i += 2) {
    ctx.fillStyle = `rgba(120,100,70,${0.05 + r() * 0.07})`;
    ctx.fillRect(0, i, 512, 1);
    ctx.fillStyle = `rgba(255,255,240,${0.04 + r() * 0.06})`;
    ctx.fillRect(i, 0, 1, 512);
  }
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(110,90,60,${r() * 0.12})`;
    ctx.fillRect(r() * 512, r() * 512, 1 + r() * 6, 1);
  }
  // border stripes along the runner's long edges (v = 0 and 1)
  const stripe = (y, h, col) => { ctx.fillStyle = col; ctx.fillRect(0, y, 512, h); };
  stripe(18, 10, 'rgba(178,86,58,0.85)'); stripe(34, 3, 'rgba(178,86,58,0.75)');
  stripe(512 - 28, 10, 'rgba(178,86,58,0.85)'); stripe(512 - 37, 3, 'rgba(178,86,58,0.75)');
  return toTexture(c, { repeat: [4, 1] });
}

export function corkTexture() {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#b98b5a';
  ctx.fillRect(0, 0, 512, 512);
  const r = rng(11);
  for (let i = 0; i < 9000; i++) {
    const s = 1 + r() * 3.5, l = r();
    ctx.fillStyle = l < 0.5 ? `rgba(90,58,30,${0.25 + r() * 0.4})` : `rgba(230,190,140,${0.2 + r() * 0.3})`;
    ctx.beginPath(); ctx.arc(r() * 512, r() * 512, s, 0, Math.PI * 2); ctx.fill();
  }
  // painted landing mark
  ctx.strokeStyle = 'rgba(250,244,230,0.92)';
  ctx.lineWidth = 16;
  ctx.beginPath(); ctx.arc(256, 256, 205, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 14]);
  ctx.beginPath(); ctx.arc(256, 256, 176, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(250,244,230,0.94)';
  ctx.fillRect(176, 150, 36, 212); ctx.fillRect(300, 150, 36, 212); ctx.fillRect(176, 238, 160, 36);
  return toTexture(c);
}

// Paper tea bag: fibrous filter paper, crimped edges, leaves visible through the middle.
export function teabagTexture() {
  const W = 512, Hh = 640;
  const [c, ctx] = canvas(W, Hh);
  ctx.fillStyle = '#f1e9d6';
  ctx.fillRect(0, 0, W, Hh);
  const r = rng(23);
  // Leaves showing through the paper: torn flakes and dust, denser towards the bottom where they settle,
  // soft-edged because they sit behind the filter paper.
  // (Drawn sharp on a layer and blurred once as the layer goes on. A filter on each of 2,600 shapes made a
  // phone's GPU canvas keep a blurred copy per shape: about 3 GB, enough for Android to kill the browser.)
  const [lc, lx] = canvas(W, Hh);
  for (let i = 0; i < 2600; i++) {
    const y = 100 + Math.pow(r(), 0.75) * 460, x = 70 + r() * 372;
    const s = 2 + r() * 9, a = r() * Math.PI;
    lx.save();
    lx.translate(x, y); lx.rotate(a);
    lx.fillStyle = `rgba(${78 + r() * 50},${48 + r() * 30},${22 + r() * 18},${0.05 + r() * 0.12})`;
    lx.beginPath();
    lx.moveTo(-s, 0); lx.lineTo(-s * 0.2, -s * (0.25 + r() * 0.3)); lx.lineTo(s, -s * 0.1 * r()); lx.lineTo(s * 0.3, s * (0.2 + r() * 0.3));
    lx.closePath(); lx.fill();
    lx.restore();
  }
  blurOnto(ctx, lc, 0.8);
  // Paper fibres.
  for (let i = 0; i < 1800; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.08 + r() * 0.18})`;
    ctx.lineWidth = 0.7;
    const x = r() * W, y = r() * Hh, a = r() * Math.PI;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a + 0.5) * 7, y + Math.sin(a + 0.5) * 7, x + Math.cos(a) * 14, y + Math.sin(a) * 14); ctx.stroke();
  }
  // Crimped seams top and bottom.
  for (const y0 of [12, 568]) {
    ctx.fillStyle = 'rgba(226,213,188,1)';
    ctx.fillRect(0, y0, W, 60);
    ctx.fillStyle = 'rgba(150,130,100,0.3)';
    for (let x = 6; x < W; x += 12) ctx.fillRect(x, y0 + 6, 4, 48);
  }
  // Side folds.
  ctx.fillStyle = 'rgba(160,140,110,0.16)';
  ctx.fillRect(0, 0, 20, Hh); ctx.fillRect(W - 20, 0, 20, Hh);
  return toTexture(c);
}

export function tagTexture() {
  const [c, ctx] = canvas(128, 160);
  ctx.fillStyle = '#f7f0e2';
  ctx.fillRect(0, 0, 128, 160);
  ctx.fillStyle = '#b4563a';
  ctx.fillRect(0, 108, 128, 52);
  ctx.fillStyle = '#f7f0e2';
  ctx.font = 'bold 30px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('TEA', 64, 145);
  ctx.fillStyle = '#3b2a1f';
  ctx.font = 'italic 20px Georgia, serif';
  ctx.fillText('English', 64, 62);
  ctx.fillText('Breakfast', 64, 86);
  return toTexture(c, { aniso: 4 });
}

export function plasterTexture() {
  const [c, ctx] = canvas(512, 512);
  const img = ctx.createImageData(512, 512);
  const n = makeNoise(31);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const t = 0.92 + 0.08 * fbm(n, x / 40, y / 40, 4);
    const i = (y * 512 + x) * 4;
    img.data[i] = 238 * t; img.data[i + 1] = 226 * t; img.data[i + 2] = 205 * t; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { repeat: [3, 2] });
}

export function tileTexture() {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#c9c2b4';
  ctx.fillRect(0, 0, 512, 512);
  const r = rng(5);
  const tw = 128, th = 64;
  for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
    const x = col * tw + (row % 2 ? tw / 2 : 0), y = row * th;
    const l = 238 + r() * 12;
    const grd = ctx.createLinearGradient(x, y, x, y + th);
    grd.addColorStop(0, `rgb(${l},${l - 2},${l - 8})`);
    grd.addColorStop(1, `rgb(${l - 14},${l - 16},${l - 22})`);
    ctx.fillStyle = grd;
    ctx.fillRect(x + 3, y + 3, tw - 6, th - 6);
  }
  return toTexture(c, { repeat: [6, 3] });
}

export function floorTexture() {
  const [c, ctx] = canvas(512, 512);
  const r = rng(9);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const h = 20 + r() * 8, l = 46 + r() * 8;
    ctx.fillStyle = `hsl(${h},${45 + r() * 10}%,${l}%)`;
    ctx.fillRect(x * 128, y * 128, 128, 128);
    ctx.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`;
    for (let k = 0; k < 40; k++) ctx.fillRect(x * 128 + r() * 128, y * 128 + r() * 128, 2 + r() * 10, 2 + r() * 10);
  }
  ctx.strokeStyle = '#d8cbb6';
  ctx.lineWidth = 5;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(512, i * 128); ctx.stroke();
  }
  return toTexture(c, { repeat: [6, 6] });
}

// Soft radial blob used for contact shadows, scorch marks and particles.
export function radialTexture(inner = 'rgba(0,0,0,1)', outer = 'rgba(0,0,0,0)', size = 128) {
  const [c, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(c, { srgb: false, aniso: 1 });
}

// Window view: soft morning garden, deliberately out of focus.
export function windowViewTexture() {
  const [c, ctx] = canvas(1024, 768);
  const sky = ctx.createLinearGradient(0, 0, 0, 768);
  sky.addColorStop(0, '#cfe3f2'); sky.addColorStop(0.55, '#f6efe0'); sky.addColorStop(1, '#e8dcc0');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 1024, 768);
  const r = rng(41);
  // Out of focus: drawn on a layer, blurred once as it goes on (see teabagTexture).
  const [lc, lx] = canvas(1024, 768);
  for (let i = 0; i < 40; i++) {
    lx.fillStyle = `rgba(${70 + r() * 50},${110 + r() * 50},${60 + r() * 30},${0.35 + r() * 0.35})`;
    lx.beginPath(); lx.arc(r() * 1024, 380 + r() * 400, 60 + r() * 140, 0, Math.PI * 2); lx.fill();
  }
  for (let i = 0; i < 16; i++) {
    lx.fillStyle = `rgba(${230 + r() * 25},${170 + r() * 60},${150 + r() * 60},0.5)`;
    lx.beginPath(); lx.arc(r() * 1024, 520 + r() * 220, 14 + r() * 26, 0, Math.PI * 2); lx.fill();
  }
  lx.fillStyle = 'rgba(255,250,235,0.55)';
  lx.beginPath(); lx.arc(760, 150, 160, 0, Math.PI * 2); lx.fill();
  blurOnto(ctx, lc, 18);
  return toTexture(c);
}

export function heliDecalTexture() {
  const [c, ctx] = canvas(256, 128);
  ctx.fillStyle = '#d64a31';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#f4ead8';
  ctx.fillRect(0, 70, 256, 12);
  ctx.fillStyle = '#2b2b33';
  ctx.fillRect(0, 84, 256, 5);
  ctx.fillStyle = '#f4ead8';
  ctx.font = 'bold 30px "Trebuchet MS", sans-serif';
  ctx.fillText('HT-1', 150, 54);
  return toTexture(c);
}
