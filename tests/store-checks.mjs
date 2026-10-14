import assert from 'node:assert/strict';
import { Flight, NCH, encodeFlight, decodeFlight } from '../src/replay/format.js';
import { FlightStore } from '../src/replay/store.js';

const flight = () => { const f = new Flight({ aircraft: 'micro', def: {}, recordHz: 60, physicsHz: 240 }); f.samples.push(new Float32Array(NCH)); return f; };
const f = flight(), store = new FlightStore(); store.available = true;
let advance = true, bodyN = 0, header;
globalThis.fetch = async (url, opts) => {
  if (url.endsWith('.bin')) {
    bodyN = opts.body.byteLength / (NCH * 4);
    if (advance) { advance = false; f.samples.push(new Float32Array(NCH)); f.notes.push({ text: 'during save' }); f.dirty = true; }
  } else header = JSON.parse(opts.body);
  return { ok: true, json: async () => ({ path: 'test' }) };
};
assert.equal(await store.save(f), true);
assert.equal(f.savedN, 1); assert.equal(f.dirty, true); assert.equal(header.nSamples, bodyN); assert.equal(header.notes.length, 0);
assert.equal(await store.save(f, { notesOnly: true }), true);
assert.equal(f.savedN, 2); assert.equal(header.nSamples, bodyN); assert.equal(header.notes.length, 1); assert.equal(f.dirty, false);
console.log('PASS  recording and notes added during server saves stay dirty and resave consistent data');

const local = new FlightStore(), lf = flight();
local.openDb = async () => ({}); local.prune = async () => {};
local.tx = async () => { lf.notes.push({ text: 'new note' }); lf.dirty = true; };
await local.localSave(lf);
assert.equal(lf.savedN, 1); assert.equal(lf.dirty, true);
console.log('PASS  browser storage completion does not erase unsaved note edits');

const encoded = encodeFlight(f);
assert.equal(decodeFlight(encoded.json, encoded.bin).n, 2);
assert.throws(() => decodeFlight(encoded.json, encoded.bin.slice(0, 4)), /truncated/);
assert.throws(() => decodeFlight({ ...encoded.json, entities: [{ offset: 0, width: 0, nKeys: 1 }] }, encoded.bin), /entity range/);
console.log('PASS  replay decoder rejects truncated samples and invalid entity ranges');

let fail = true;
globalThis.fetch = async () => ({ ok: !fail, status: 500, json: async () => ({ path: 'test' }) });
f.dirty = true;
assert.equal(await store.save(f), false); assert.equal(f.dirty, true); assert.match(store.lastError, /500/);
fail = false; assert.equal(await store.save(f), true); assert.equal(store.lastError, '');
console.log('PASS  failed saves retain dirty state and successful retries clear the error');
