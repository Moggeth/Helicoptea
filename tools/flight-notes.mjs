// Summarise recorded flights and their feel notes alongside the telemetry around each note.
// Reads logs/flights/<id>.json + .bin (written by the game through the dev / preview server).
//
//   node tools/flight-notes.mjs                  the newest flight that has notes
//   node tools/flight-notes.mjs latest           the newest flight, notes or not
//   node tools/flight-notes.mjs all              every flight with notes (oldest first)
//   node tools/flight-notes.mjs <id>             one flight (a unique prefix of the id is enough)
//   options: --window 1.5    seconds either side of each note (as flown), default 1
//            --dir <path>    folder of flights, default logs/flights
//            --csv 3.2-5.0   also print every sample in that as-flown time range as CSV
//            --channels a,b  channels for --csv (default: the feel set below)
//            --json          print the summary as JSON instead of Markdown
// See docs/FLIGHT-LOGS.md for the format.
import fs from 'node:fs';
import path from 'node:path';
import { decodeFlight, CH, CHANNELS } from '../src/replay/format.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const dir = path.resolve(opt('dir', 'logs/flights'));
const win = parseFloat(opt('window', '1'));
const asJson = args.includes('--json');
const which = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--json')) || 'notes';
const FEEL = ['in.pitch', 'in.roll', 'in.yaw', 'in.coll', 'collective', 'thrustFrac', 'tw', 'agl', 'hspeed', 'vspeed', 'pitch', 'roll', 'rate.pitch', 'rate.roll', 'rate.yaw', 'load', 'loadMass'];
const SHOW = { agl: [100, 'cm'], load: [1000, 'mN'], loadMass: [1000, 'g'], collective: [100, '%'], thrustFrac: [100, '%'] };

if (!fs.existsSync(dir)) { console.error(`No flights yet: ${dir} does not exist. Fly with the dev or preview server running.`); process.exit(1); }
const headers = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; }
}).filter((j) => j && j.format === 'helicoptea-flight').sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
if (!headers.length) { console.error(`No flights in ${dir}.`); process.exit(1); }

let pick;
if (which === 'all') pick = headers.filter((h) => (h.notes || []).length);
else if (which === 'latest') pick = headers.slice(-1);
else if (which === 'notes') pick = headers.filter((h) => (h.notes || []).length).slice(-1);
else pick = headers.filter((h) => h.id.startsWith(which));
if (!pick.length) { console.error(`No matching flight (${which}). ${headers.length} flights in ${dir}; newest ${headers[headers.length - 1].id}.`); process.exit(1); }

const fmt = (w) => { const m = Math.floor(w / 60), s = w - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`; };
const num = (v, k) => { const s = SHOW[k]; const x = s ? v * s[0] : v; return Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2); };
const out = [];

for (const h of pick) {
  const bin = fs.readFileSync(path.join(dir, `${h.id}.bin`));
  const f = decodeFlight(h, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  const S = f.samples;
  const sum = h.summary || f.summary();
  const flight = { id: f.id, aircraft: f.aircraft, startedAt: f.startedAt, asFlown: f.wallDuration(), simTime: f.duration(), worldSpeed: S.get(0, CH.worldSpeed), summary: sum, notes: [] };
  for (const n of f.notes) {
    const i0 = Math.max(0, Math.floor(f.indexAtWall(n.wall - win))), i1 = Math.min(f.n - 1, Math.ceil(f.indexAtWall(n.wall + win)));
    const at = Math.min(f.n - 1, Math.round(n.i));
    const stats = {};
    for (const k of FEEL) {
      let lo = Infinity, hi = -Infinity, sm = 0, c = 0;
      for (let i = i0; i <= i1; i++) { const v = S.get(i, CH[k]); lo = Math.min(lo, v); hi = Math.max(hi, v); sm += v; c++; }
      stats[k] = { min: lo, mean: sm / c, max: hi, at: S.get(at, CH[k]) };
    }
    const ctx = { assist: S.get(at, CH.assist) > 0.5, device: ['keyboard', 'gamepad', 'touch'][S.get(at, CH.src)] || 'keyboard', alive: S.get(at, CH.alive) > 0.5, carried: S.get(at, CH.nCarried) };
    const events = f.events.filter((e) => e.wall >= n.wall - win && e.wall <= n.wall + win).map((e) => ({ type: e.type, wall: e.wall, ...(e.speed !== undefined ? { speed: e.speed } : {}), ...(e.dv !== undefined ? { dv: e.dv } : {}), ...(e.reason ? { reason: e.reason, impact: e.impact } : {}) }));
    flight.notes.push({ ...n, window: [Math.max(0, n.wall - win), n.wall + win], context: ctx, stats, events });
  }
  out.push(flight);
  if (asJson) continue;
  console.log(`# Flight ${f.id}`);
  console.log(`${f.aircraft} · ${fmt(f.wallDuration())} as flown (${f.duration().toFixed(2)} s simulated, world speed ${flight.worldSpeed.toFixed(2)}) · started ${f.startedAt} · devices ${sum.devices.join(', ')} · Assist on ${Math.round(sum.assistShare * 100)}% of the time`);
  if (sum.crash) console.log(`Crash: ${sum.crash.reason} at ${fmt(sum.crash.wall)}${sum.crash.impact ? ` (${sum.crash.impact} m/s)` : ''}`);
  console.log(`Max speed ${sum.maxSpeed.toFixed(2)} m/s, max height ${(sum.maxAgl * 100).toFixed(0)} cm, max tilt ${sum.maxTiltDeg}°, ${sum.touchdowns} touchdowns, ${sum.bumps} bumps, ${sum.snatches} snatches, ${sum.scrapes} scrapes, ${sum.attaches} hook-ups`);
  if (!flight.notes.length) console.log('\n(no notes on this flight)');
  for (const n of flight.notes) {
    console.log(`\n## ${fmt(n.wall)} · ${n.tag.toUpperCase()} · ${n.text ? `"${n.text}"` : '(no text)'}${n.source === 'flight' ? ' · marked in flight' : ''}`);
    console.log(`Window ${fmt(n.window[0])} to ${fmt(n.window[1])} · Assist ${n.context.assist ? 'on' : 'off'} · ${n.context.device}${n.context.alive ? '' : ' · after the crash'}${n.context.carried ? ` · ${n.context.carried} on the hook` : ''}`);
    console.log('\n| channel | at note | min | mean | max |\n|---|---|---|---|---|');
    for (const k of FEEL) {
      const s = n.stats[k], u = SHOW[k] ? ` ${SHOW[k][1]}` : (CHANNELS[CH[k]][1] && !CHANNELS[CH[k]][1].includes('..') ? ` ${CHANNELS[CH[k]][1]}` : '');
      console.log(`| ${k}${u} | ${num(s.at, k)} | ${num(s.min, k)} | ${num(s.mean, k)} | ${num(s.max, k)} |`);
    }
    if (n.events.length) console.log(`\nEvents: ${n.events.map((e) => `${e.type} ${fmt(e.wall)}${e.speed !== undefined ? ` (${e.speed} m/s)` : e.dv !== undefined ? ` (${e.dv} m/s)` : ''}${e.reason ? ` ${e.reason}` : ''}`).join(', ')}`);
  }
  const csv = opt('csv', null);
  if (csv) {
    const [a, b] = csv.split('-').map(parseFloat);
    const chans = (opt('channels', null) || ['wall', ...FEEL].join(',')).split(',').filter((c) => CH[c] !== undefined);
    console.log(`\n\`\`\`csv\n${chans.join(',')}`);
    for (let i = Math.floor(f.indexAtWall(a)); i <= Math.ceil(f.indexAtWall(b)) && i < f.n; i++) console.log(chans.map((c) => +S.get(i, CH[c]).toFixed(5)).join(','));
    console.log('```');
  }
  console.log('');
}
if (asJson) console.log(JSON.stringify(out, null, 2));
