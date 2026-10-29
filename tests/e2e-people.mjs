// The neighbours (src/sim/people.js) in a real browser: each one drawn as a single skinned mesh with no
// shader built mid-flight, watching the helicopter that comes close and offering their cup, pleased (and
// saying so) when the tea is brewed to their liking and not when it's stewed, and a rotor strike: "ow", a
// nick where the blade touched, and the flight over with the person named on the crash screen.
// Usage: npx vite --port 4391 (or a preview build), then node tests/e2e-people.mjs [baseUrl] [--headed]
import { chromium, startupTimeout } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4391/';
const outDir = path.resolve('test-results/people');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const browser = await chromium.launch({ executablePath: CHROME, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.setDefaultTimeout(startupTimeout(90000));
page.setDefaultNavigationTimeout(startupTimeout(90000));
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const H = (fn, arg) => page.evaluate(fn, arg);
const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png` });

try {
  await page.goto(`${base}?view=chase&record=0&quality=high&fs=0`, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)');
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await H(() => {
    const H = window.__helicoptea;
    H.doAction('skiphints');
    const ap = new H.Autopilot();
    const orig = H.input.update.bind(H.input);
    window.__pilot = { ap, on: false };
    H.input.update = (dt) => { const c = orig(dt); const P = window.__pilot; if (!P.on || !H.sim.heli) return c; Object.assign(c, ap.update(H.sim.heli, null, null, dt)); return c; };
    H.sim.assist = true;
    // Keep the people's events.
    window.__said = [];
    const emit = H.sim.emit.bind(H.sim);
    H.sim.emit = (type, data = {}) => { if (type === 'personSay' || type === 'personStrike' || type === 'crash') window.__said.push({ type, word: data.word, who: data.who, material: data.material, reason: data.reason }); return emit(type, data); };
  });
  await sleep(800);

  // ---------------------------------------------------------------- drawn cheaply
  const drawn = await H(() => {
    const H = window.__helicoptea, out = [];
    for (const c of H.world.chunks.values()) c.group.traverse((o) => { if (o.isSkinnedMesh && o.name.startsWith('person-')) out.push({ name: o.name, tris: o.geometry.index.count / 3, mat: o.material.name }); });
    return { people: out, programs: H.renderer.info.programs.length };
  });
  check('seven neighbours, each one skinned mesh on the shared material', drawn.people.length === 7 && drawn.people.every((p) => p.mat === 'people'), JSON.stringify(drawn.people.map((p) => `${p.name}:${p.tris}`)));
  check('a person stays under 4,000 triangles', drawn.people.every((p) => p.tris < 4000), `max ${Math.max(...drawn.people.map((p) => p.tris))}`);
  check('their cups carry their names', await H(() => window.__helicoptea.sim.cups.filter((c) => c.owner).map((c) => c.name).length === 7));

  // ---------------------------------------------------------------- Agnes watches the helicopter come
  const ag = await H(() => {
    const H = window.__helicoptea, p = H.sim.people.list[0];
    const head = p.poser.j.head.clone().applyMatrix4(p.place), f = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
    return { head: [head.x, head.y, head.z], f: [f.x, f.z], cup: [p.sim.cups[p.cupIndex].x, p.sim.cups[p.cupIndex].z] };
  });
  const hover = [ag.head[0] + ag.f[0] * 0.75 - ag.f[1] * 0.25, ag.head[1] + 0.02, ag.head[2] + ag.f[1] * 0.75 + ag.f[0] * 0.25];
  await H(([x, y, z]) => {
    const s = window.__helicoptea.sim; s.heli.body.setTranslation({ x, y, z }, true); s.heli.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    const P = window.__pilot; P.on = true; P.ap.target.set(x, y, z); P.ap.maxSpeed = 0.15;
  }, hover);
  const progs0 = await H(() => window.__helicoptea.renderer.info.programs.length);
  await sleep(3500);
  const watch = await H(() => {
    const p = window.__helicoptea.sim.people.list[0], h = window.__helicoptea.sim.heli;
    const hp = p.local(h.pos, h.pos.clone()), n = p.poser.j.neck;
    const want = Math.atan2(hp.x - n.x, hp.z - n.z);
    return { lookYaw: +p.look.yaw.toFixed(2), want: +want.toFixed(2), react: p.react && p.react.kind, offered: p.offered, colliders: !!p.colliders };
  });
  check('Agnes turns to watch the helicopter close by', Math.abs(watch.lookYaw - watch.want) < 0.35 || watch.react === 'offer', JSON.stringify(watch));
  check('her colliders exist while the helicopter is near', watch.colliders);
  check('she offers her cup once it hangs about', watch.offered, JSON.stringify(watch));
  await H(([x, y, z, hx, hy, hz]) => { const f = window.__helicoptea.freeCam; f.on = true; f.pos.set(x, y, z); f.look.set(hx, hy, hz); }, [hover[0] + ag.f[0] * 0.6, hover[1] + 0.15, hover[2] + ag.f[1] * 0.6, ag.head[0], ag.head[1] - 0.15, ag.head[2]]);
  await sleep(500);
  await shot('agnes-watching');

  // ---------------------------------------------------------------- the tea
  await H(() => { const s = window.__helicoptea.sim, p = s.people.list[0]; s.cups[p.cupIndex].brew = 0.55; });
  await sleep(1400);
  const pleased = await H(() => { const p = window.__helicoptea.sim.people.list[0]; return { tea: p.tea, smile: p.P.mouth[1], said: window.__said.filter((e) => e.type === 'personSay').map((e) => e.word) }; });
  check('a proper brew pleases Agnes, and she says so', pleased.tea === 'pleased' && pleased.said.includes('mm'), JSON.stringify(pleased));
  await shot('agnes-pleased');
  await sleep(2500);
  check('she keeps smiling at it', await H(() => window.__helicoptea.sim.people.list[0].P.mouth[1] === 1));
  await H(() => { const s = window.__helicoptea.sim, p = s.people.list[0]; s.cups[p.cupIndex].brew = 0.95; });
  await sleep(700);
  const stewed = await H(() => { const p = window.__helicoptea.sim.people.list[0]; return { tea: p.tea, said: window.__said.filter((e) => e.type === 'personSay').map((e) => e.word) }; });
  check('stewed past her liking, she is not pleased', stewed.tea === 'stewed' && stewed.said.includes('hmm'), JSON.stringify(stewed));
  check('no shader was built while watching and reacting', (await H(() => window.__helicoptea.renderer.info.programs.length)) === progs0);

  // ---------------------------------------------------------------- the rotor strike
  await H(() => { window.__helicoptea.freeCam.on = false; });
  // Side on at head height (the disc reaches past the cabin's flanks, not past its nose).
  await H(([x, y, z]) => {
    const s = window.__helicoptea.sim; s.heli.body.setTranslation({ x: x - 0.6, y, z }, true); s.heli.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    s.heli.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); s.heli.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const P = window.__pilot; P.ap.target.set(x - 0.6, y, z); P.ap.maxSpeed = 0.25;
  }, [ag.head[0], ag.head[1] - 0.03, ag.head[2]]);
  await sleep(1500);
  await H(([x, y, z]) => { window.__pilot.ap.target.set(x, y, z); }, [ag.head[0], ag.head[1] - 0.03, ag.head[2]]);
  await page.waitForFunction(() => window.__said.some((e) => e.type === 'crash'), null, { timeout: 15000 }).catch(() => {});
  await sleep(600);
  const hit = await H(() => {
    const p = window.__helicoptea.sim.people.list[0];
    return { said: window.__said, nicks: p.nicks.length, msg: document.querySelector('#crash .why, .crash .why')?.textContent || '' };
  });
  const words = hit.said.filter((e) => e.type === 'personSay').map((e) => e.word);
  const crash = hit.said.find((e) => e.type === 'crash');
  check('the blades caught her: she says ow', words.includes('ow') && hit.said.some((e) => e.type === 'personStrike' && e.who === 'Agnes'), JSON.stringify(words));
  check('the strike ends the flight as a rotor strike on a person', crash && crash.reason === 'rotor strike' && crash.material === 'person', JSON.stringify(crash));
  check('the crash screen names her', /Agnes said ow/.test(hit.msg), hit.msg);
  check('she keeps a nick where the blade touched', hit.nicks === 1);
  // A close look at the nick.
  const nick = hit.nicks && await H(() => {
    const H = window.__helicoptea, p = H.sim.people.list[0], n = p.nicks[0];
    const m = p.poser.m[n.bone].clone().multiply(n.local).premultiply(p.place);
    const at = new H.THREE.Vector3().setFromMatrixPosition(m), out = new H.THREE.Vector3(0, 0, 1).transformDirection(m);
    return { at: [at.x, at.y, at.z], out: [out.x, out.y, out.z] };
  });
  if (nick) await H(([a, o]) => { const f = window.__helicoptea.freeCam; f.on = true; f.pos.set(a[0] + o[0] * 0.45, a[1] + o[1] * 0.45 + 0.05, a[2] + o[2] * 0.45); f.look.set(a[0], a[1], a[2]); }, [nick.at, nick.out]);
  await page.addStyleTag({ content: '#hud, .hud, #touch, .hint, #hints, #crash, .crash { display: none !important; }' });
  await sleep(4000);   // her hand comes down off it
  await shot('agnes-nick');
  check('no console errors', logs.length === 0, logs.slice(0, 5).join(' | '));
} catch (e) {
  check('ran to the end', false, e.stack);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
