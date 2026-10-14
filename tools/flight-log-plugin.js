// Vite plugin: a small flight-log endpoint on the dev and preview servers, so the game can save its
// recorded flights and notes into logs/flights/ (gitignored) for later review by a person or Claude.
//
//   GET  /api/flights               list of saved flights (header summaries, newest first)
//   GET  /api/flights/<id>.json     flight header, events and notes
//   GET  /api/flights/<id>.bin      Float32 samples and keyframes
//   PUT  /api/flights/<id>.json     save the header (notes changes only rewrite this)
//   PUT  /api/flights/<id>.bin      save the binary
//
// A static build hosted anywhere else has no endpoint; the game then saves flights in the browser (src/replay/store.js).
import fs from 'node:fs';
import path from 'node:path';

const ID = /^[0-9A-Za-z_-]{6,80}$/;
const MAX_BODY = 160 * 1024 * 1024;

export function flightLogPlugin(opts = {}) {
  let dir = null;
  const attach = (server, root) => {
    dir = path.resolve(root, opts.dir || 'logs/flights');
    server.middlewares.use('/api/flights', (req, res, next) => handle(req, res, next).catch((err) => {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err && err.message || err) }));
    }));
  };
  async function handle(req, res, next) {
    const url = new URL(req.url, 'http://x');
    const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    res.setHeader('Cache-Control', 'no-store');
    if (!name) {
      if (req.method !== 'GET') return next();
      fs.mkdirSync(dir, { recursive: true });
      const list = [];
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.json')) continue;
        try {
          const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          list.push({ id: j.id, startedAt: j.startedAt, savedAt: j.savedAt, aircraft: j.aircraft, wallDuration: j.wallDuration, notes: (j.notes || []).length, crash: j.summary && j.summary.crash ? j.summary.crash.reason : null });
        } catch { /* skip a half-written file */ }
      }
      list.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ dir, flights: list }));
    }
    const m = /^(.+)\.(json|bin)$/.exec(name);
    if (!m || !ID.test(m[1])) { res.statusCode = 400; return res.end('bad flight id'); }
    const file = path.join(dir, `${m[1]}.${m[2]}`);
    if (req.method === 'GET') {
      const json = path.join(dir, `${m[1]}.json`);
      if (m[2] === 'bin' && !fs.existsSync(file) && fs.existsSync(json)) {
        // A flight downloaded from a static host carries its binary inside the JSON (binBase64).
        const j = JSON.parse(fs.readFileSync(json, 'utf8'));
        if (j.binBase64) { res.setHeader('Content-Type', 'application/octet-stream'); return res.end(Buffer.from(j.binBase64, 'base64')); }
      }
      if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
      res.setHeader('Content-Type', m[2] === 'json' ? 'application/json' : 'application/octet-stream');
      return fs.createReadStream(file).pipe(res);
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const chunks = [];
      let size = 0;
      for await (const c of req) { size += c.length; if (size > MAX_BODY) { res.statusCode = 413; return res.end('too large'); } chunks.push(c); }
      const body = Buffer.concat(chunks);
      if (m[2] === 'json') JSON.parse(body.toString('utf8')); // refuse anything that isn't JSON
      fs.mkdirSync(dir, { recursive: true });
      // Write then rename, so a reader never sees half a file.
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, body);
      fs.renameSync(tmp, file);
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, path: path.relative(path.resolve(dir, '..', '..'), file).replace(/\\/g, '/'), bytes: body.length }));
    }
    return next();
  }
  return {
    name: 'helicoptea-flight-log',
    configureServer(server) { attach(server, server.config.root); },
    configurePreviewServer(server) { attach(server, server.config.root); },
  };
}
