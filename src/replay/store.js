import { encodeFlight, decodeFlight } from './format.js';

// Saves recorded flights and notes to the dev / preview server's /api/flights endpoint (logs/flights/),
// and loads them back for the replay viewer. Without the endpoint (a static host) it reports that once
// and the flights simply stay in memory.
const API = './api/flights';

export class FlightStore {
  constructor() {
    this.available = null;   // null: not checked yet
    this.dir = '';
    this.queue = Promise.resolve();
    this.lastError = '';
    this.saving = 0;
  }

  async check() {
    try {
      const r = await fetch(`${API}?probe=1`, { cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      this.available = !!(j && Array.isArray(j.flights));
      this.dir = j ? j.dir : '';
      return j ? j.flights : [];
    } catch { this.available = false; return []; }
  }

  list() { return this.check(); }

  // Save a flight (binary only when the samples changed since the last save; notes rewrite the JSON).
  save(f, { notesOnly = false } = {}) {
    if (this.available === false || !f || !f.n) return Promise.resolve(false);
    this.saving++;
    const job = this.queue.then(async () => {
      if (this.available === null) await this.check();
      if (!this.available) return false;
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
    const [j, b] = await Promise.all([
      fetch(`${API}/${encodeURIComponent(id)}.json`, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`json ${r.status}`); return r.json(); }),
      fetch(`${API}/${encodeURIComponent(id)}.bin`, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`bin ${r.status}`); return r.arrayBuffer(); }),
    ]);
    const f = decodeFlight(j, b);
    f.savedN = f.n;
    f.savedPath = `logs/flights/${id}.json`;
    return f;
  }
}
