import { encodeFlight, decodeFlight } from './format.js';

// Saves recorded flights and notes to the dev / preview server's /api/flights endpoint (logs/flights/),
// and loads them back for the replay viewer. Without the endpoint (a static host such as Vercel) flights
// and notes go to this browser's IndexedDB instead (the newest LOCAL_KEEP are kept), and if that is
// unavailable too they stay in memory. Any flight can also be downloaded as one file (see download()).
const API = './api/flights';
const DB = 'helicoptea-flights';
const LOCAL_KEEP = 40;

export class FlightStore {
  constructor() {
    this.available = null;   // the server endpoint: null not checked yet, then true / false
    this.local = null;       // browser storage, used without the endpoint: null not checked yet, then true / false
    this.dir = '';
    this.queue = Promise.resolve();
    this.lastError = '';
    this.saving = 0;
    this.db = null;
  }

  // Where saves go: 'server', 'browser', 'memory', or null before the first check.
  get mode() {
    if (this.available) return 'server';
    if (this.available === false && this.local !== null) return this.local ? 'browser' : 'memory';
    return null;
  }

  async check() {
    try {
      const r = await fetch(`${API}?probe=1`, { cache: 'no-store' });
      // A static host may answer with its 404 page or the SPA's index.html: only JSON with a list counts.
      const j = r.ok && (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
      this.available = !!(j && Array.isArray(j.flights));
      this.dir = j ? j.dir : '';
      if (this.available) return j.flights;
    } catch { this.available = false; }
    return this.localList();
  }

  list() { return this.check(); }

  // Save a flight (binary only when the samples changed since the last save; notes rewrite the JSON).
  save(f, { notesOnly = false } = {}) {
    if (this.mode === 'memory' || !f || !f.n) return Promise.resolve(false);
    this.saving++;
    const job = this.queue.then(async () => {
      if (this.available === null) await this.check();
      if (!this.available) return this.localSave(f);
      const binN = f.savedN;
      const { json, bin } = encodeFlight(f);
      const put = (ext, body, type) => fetch(`${API}/${encodeURIComponent(f.id)}.${ext}`, { method: 'PUT', headers: { 'Content-Type': type }, body });
      if (!notesOnly || binN !== f.n) {
        const r = await put('bin', bin, 'application/octet-stream');
        if (!r.ok) throw new Error(`bin ${r.status}`);
        f.savedN = f.n;
      }
      const r = await put('json', JSON.stringify(json), 'application/json');
      if (!r.ok) throw new Error(`json ${r.status}`);
      const res = await r.json();
      f.saved = true;
      f.savedPath = res.path;
      f.dirty = false;
      return true;
    }).catch((err) => { this.lastError = String(err.message || err); return false; }).finally(() => { this.saving--; });
    this.queue = job;
    return job;
  }

  async load(id) {
    if (!this.available) {
      const rec = await this.localGet(id);
      if (!rec) throw new Error('not in this browser');
      const f = decodeFlight(rec.json, rec.bin);
      f.savedN = f.n;
      f.savedPath = 'this browser';
      return f;
    }
    const [j, b] = await Promise.all([
      fetch(`${API}/${encodeURIComponent(id)}.json`, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`json ${r.status}`); return r.json(); }),
      fetch(`${API}/${encodeURIComponent(id)}.bin`, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`bin ${r.status}`); return r.arrayBuffer(); }),
    ]);
    const f = decodeFlight(j, b);
    f.savedN = f.n;
    f.savedPath = `logs/flights/${id}.json`;
    return f;
  }

  // One self-contained file: the usual JSON header with the binary embedded as base64 (binBase64).
  // Put it in logs/flights/ and tools/flight-notes.mjs reads it like a server-saved flight.
  download(f) {
    if (!f || !f.n) return false;
    const { json, bin } = encodeFlight(f);
    json.binBase64 = toBase64(new Uint8Array(bin));
    const url = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${f.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  }

  // ---------------------------------------------------------------- browser storage (IndexedDB)
  openDb() {
    if (this.db) return this.db;
    this.db = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('heads', { keyPath: 'id' });
        r.result.createObjectStore('bins');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('IndexedDB unavailable'));
      r.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
    this.db.then(() => { this.local = true; }, () => { this.local = false; });
    return this.db;
  }

  // Run fn(transaction) and resolve with its result once the transaction has committed.
  async tx(stores, mode, fn) {
    const t = (await this.openDb()).transaction(stores, mode);
    const done = new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('aborted'));
    });
    const [out] = await Promise.all([fn(t), done]);
    return out;
  }

  async localList() {
    try {
      const heads = await this.tx(['heads'], 'readonly', (t) => req(t.objectStore('heads').getAll()));
      return heads.map(({ id, startedAt, savedAt, aircraft, wallDuration, notes, crash }) => ({ id, startedAt, savedAt, aircraft, wallDuration, notes, crash }))
        .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    } catch { return []; }
  }

  async localSave(f) {
    try { await this.openDb(); } catch { return false; }
    const { json, bin } = encodeFlight(f);
    const head = { id: f.id, startedAt: json.startedAt, savedAt: json.savedAt, aircraft: json.aircraft, wallDuration: json.wallDuration, notes: json.notes.length, crash: json.summary && json.summary.crash ? json.summary.crash.reason : null, json };
    await this.tx(['heads', 'bins'], 'readwrite', (t) => {
      t.objectStore('heads').put(head);
      t.objectStore('bins').put(bin, f.id);
    });
    f.savedN = f.n;
    f.saved = true;
    f.savedPath = 'this browser';
    f.dirty = false;
    this.lastError = '';
    this.prune().catch(() => {});
    return true;
  }

  localGet(id) {
    return this.tx(['heads', 'bins'], 'readonly', async (t) => {
      const [h, bin] = await Promise.all([req(t.objectStore('heads').get(id)), req(t.objectStore('bins').get(id))]);
      return h && bin ? { json: h.json, bin } : null;
    });
  }

  // Keep the newest LOCAL_KEEP flights, so a long session of crashes can't fill the browser's quota.
  async prune() {
    const old = (await this.localList()).slice(LOCAL_KEEP).map((d) => d.id);
    if (!old.length) return;
    await this.tx(['heads', 'bins'], 'readwrite', (t) => { for (const id of old) { t.objectStore('heads').delete(id); t.objectStore('bins').delete(id); } });
  }
}

const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
