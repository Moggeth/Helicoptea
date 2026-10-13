// Manoeuvre checks: a J-turn (dash, pull up into a zoom climb, pedal-turn at the top, dive back the way
// you came) for both aircraft, flown by a scripted "human" that only moves the sticks; plus weathervaning.
import * as THREE from 'three';
import { initPhysics } from '../src/sim/physics.js';
import { Sim } from '../src/sim/sim.js';
import { Autopilot } from '../src/sim/autopilot.js';
import { CFG } from '../src/config.js';

await initPhysics();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const clamp = THREE.MathUtils.clamp;
const f = (x, d = 2) => Number(x).toFixed(d);

function setup(type) {
  const sim = new Sim(type === 'chinook' ? { aircraft: 'chinook' } : undefined);
  const ap = new Autopilot();
  ap.yaw = -Math.PI / 2; ap.maxSpeed = 0.3; ap.target.set(-0.7, 0.5, 0.0); // clear lane above everything, nose to +x
  for (let i = 0; i < 240 * 8 && sim.heli; i++) sim.step(ap.update(sim.heli));
  return sim;
}

function attitude(h) {
  const fw = new THREE.Vector3(0, 0, -1).applyQuaternion(h.quat);
  const rt = new THREE.Vector3(1, 0, 0).applyQuaternion(h.quat);
  const w = h.body.angvel();
  const wb = new THREE.Vector3(w.x, w.y, w.z).applyQuaternion(h.quat.clone().invert());
  return { pitch: Math.asin(clamp(fw.y, -1, 1)), roll: Math.asin(clamp(-rt.y, -1, 1)), hdg: h.heading(), wb };
}

// Assist off: the pilot closes attitude loops with the sticks, as a person would.
function jTurn(type, assist) {
  const sim = setup(type);
  sim.assist = assist;
  const h = () => sim.heli;
  const y0 = h().pos.y, hdg0 = h().heading();
  const holdAlt = (y) => clamp((y - h().pos.y) * 3 - h().vel.y * 1.5, -1, 1);
  const stick = (tgtPitch, coll, yaw, hdgTgt) => {
    const a = attitude(h());
    if (assist) {
      // With assist the stick commands attitude directly.
      let yw = yaw ?? 0;
      if (hdgTgt !== undefined) { let d = hdgTgt - a.hdg; d = Math.atan2(Math.sin(d), Math.cos(d)); yw = clamp(-d * 2, -1, 1); }
      return { pitch: clamp(-tgtPitch / CFG.assist.maxTilt, -1, 1), roll: 0, yaw: yw, collective: coll };
    }
    let yw = yaw ?? 0;
    if (hdgTgt !== undefined) { let d = hdgTgt - a.hdg; d = Math.atan2(Math.sin(d), Math.cos(d)); yw = clamp(-d * 2.5 + a.wb.y * 0.6, -1, 1); }
    return { pitch: clamp(-(tgtPitch - a.pitch) * 3 + a.wb.x * 0.5, -1, 1), roll: clamp(-a.roll * 3 + a.wb.z * 0.5, -1, 1), yaw: yw, collective: coll };
  };
  let phase = 'dash', apexY = y0, maxV = 0, t = 0, kickAt = null, turnedAt = null, reversedAt = null;
  for (let i = 0; i < 240 * 14 && h(); i++) {
    const vx = h().vel.x;
    let c;
    if (phase === 'dash') { c = stick(-0.32, assist ? 0 : holdAlt(y0), undefined, hdg0); if (vx > 0.75 || h().pos.x > 0.15) phase = 'pull'; }
    else if (phase === 'pull') { c = stick(0.6, assist ? 1 : 0.7, undefined, hdg0); if (vx < 0.35) { phase = 'kick'; kickAt = t; } }
    else if (phase === 'kick') {
      c = stick(-0.05, assist ? 0 : holdAlt(apexY), 1);
      let d = hdg0 + Math.PI - attitude(h()).hdg; d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) < 0.35) { phase = 'dive'; turnedAt = t; }
    } else { c = stick(-0.35, assist ? -0.3 : holdAlt(apexY - 0.1), undefined, hdg0 + Math.PI); if (reversedAt === null && vx < -0.4) reversedAt = t; }
    apexY = Math.max(apexY, h().pos.y);
    maxV = Math.max(maxV, vx);
    sim.step(c);
    t += sim.dt;
    if (reversedAt !== null && t - reversedAt > 0.4) break;
  }
  const ws = CFG.physics.worldSpeed;
  const label = `${type} ${assist ? '(assist on)' : '(assist off)'}`;
  check(`J-turn ${label}: flies it without crashing`, sim.state === 'flying', sim.crashInfo ? sim.crashInfo.reason : `top speed ${f(maxV)} m/s`);
  check(`J-turn ${label}: speed bleeds into a zoom climb`, apexY - y0 > 0.04, `climbed ${f((apexY - y0) * 100, 1)} cm`);
  check(`J-turn ${label}: pedal turn of 180 deg at the top`, turnedAt !== null && (turnedAt - kickAt) / ws < 3.5, turnedAt !== null ? `${f((turnedAt - kickAt) / ws, 1)} s real` : 'never turned');
  check(`J-turn ${label}: dives back the way it came`, reversedAt !== null, reversedAt !== null ? '' : 'never reversed');
}

for (const type of ['micro', 'chinook']) jTurn(type, false);
jTurn('micro', true);

// Weathervaning: sideslip at speed swings the nose into the airflow (assist off, sticks neutral).
for (const type of ['micro', 'chinook']) {
  const sim = setup(type);
  sim.assist = false;
  const h = sim.heli;
  const hdg0 = h.heading();
  // Slide to the heli's right at 0.7 m/s.
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(h.quat); right.y = 0; right.normalize().multiplyScalar(0.7);
  h.body.setLinvel({ x: right.x, y: 0, z: right.z }, true);
  for (let i = 0; i < 240 * 0.8 && sim.heli; i++) sim.step({ pitch: 0, roll: 0, yaw: 0, collective: 0 });
  let d = sim.heli ? sim.heli.heading() - hdg0 : 0; d = Math.atan2(Math.sin(d), Math.cos(d));
  check(`${type}: weathervanes into a sideslip at speed`, d < -0.08, `heading change ${f(d * 57.3, 0)} deg (negative = towards the slide)`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} manoeuvre checks passed`);
process.exit(failed.length ? 1 : 0);
