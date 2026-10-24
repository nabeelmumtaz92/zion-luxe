#!/usr/bin/env node
// Zion Luxe local server (runs on the Mac): receives website form submissions, stores them,
// generates a draft itinerary, and serves the inquiries dashboard.
//   node server.js        -> http://localhost:8799
const http = require('http'), fs = require('fs'), path = require('path');
const { draftFor } = require('./itinerary/draft');
const PORT = process.env.PORT || 8799;
const DB = path.join(__dirname, 'data', 'inquiries.json');
fs.mkdirSync(path.dirname(DB), { recursive: true });
const load = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return []; } };
const save = (x) => fs.writeFileSync(DB, JSON.stringify(x, null, 2));
const SEEN = path.join(__dirname, 'data', 'screened.json');
const seenFile = { get: () => { try { return JSON.parse(fs.readFileSync(SEEN, 'utf8')); } catch { return []; } }, set: (x) => fs.writeFileSync(SEEN, JSON.stringify(x)) };
const STATUSES = ['New', 'Contacted', 'Proposal sent', 'Booked', 'Traveled', 'Not a fit / No response'];

function body(req) {
  return new Promise((res) => { let b = ''; req.on('data', c => { b += c; if (b.length > 1e6) req.destroy(); }); req.on('end', () => res(b)); });
}
function parse(raw, type) {
  if ((type || '').includes('json')) return JSON.parse(raw || '{}');
  return Object.fromEntries(new URLSearchParams(raw));
}
const clean = (v, n = 2000) => String(v ?? '').slice(0, n);

async function makeDraft(id) {
  const all = load(); const q = all.find(x => x.id === id); if (!q) return;
  q.draftStatus = 'drafting'; save(all);
  try {
    const r = await draftFor(q);
    const a2 = load(); const q2 = a2.find(x => x.id === id);
    Object.assign(q2, { draft: r.text, draftProvider: r.provider, draftFile: r.file, draftStatus: r.problems.length ? 'needs review' : 'ready' });
    save(a2);
  } catch (e) {
    const a2 = load(); const q2 = a2.find(x => x.id === id); q2.draftStatus = 'error: ' + e.message.slice(0, 300); save(a2);
  }
}

// Reachable from this Mac and from your own Tailscale devices (e.g. the laptop), nothing else
const tailnetOnly = (ip) => {
  ip = String(ip || '').replace(/^::ffff:/, '');
  if (ip === '127.0.0.1' || ip === '::1' || ip.toLowerCase().startsWith('fd7a:115c:a1e0:')) return true;
  const [a, b] = ip.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127; // Tailscale's 100.64.0.0/10
};

const server = http.createServer(async (req, res) => {
  if (!tailnetOnly(req.socket.remoteAddress)) { res.writeHead(403); return res.end(); }
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
  const send = (code, obj, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, ...cors }); res.end(type === 'application/json' ? JSON.stringify(obj) : obj); };
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(204, '');
  try {
    if (req.method === 'POST' && url.pathname === '/api/lead') {
      const d = parse(await body(req), req.headers['content-type']);
      const q = { id: Date.now(), date: new Date().toISOString(), status: 'New', followUp: '', draftStatus: 'queued' };
      for (const k of ['name', 'phone', 'email', 'destination', 'dates', 'travelers', 'tripType', 'budget', 'source', 'notes']) q[k] = clean(d[k]);
      if (!q.name || !q.email || !q.destination) return send(400, { error: 'missing fields' });
      const all = load(); all.unshift(q); save(all);
      makeDraft(q.id);
      return send(200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/inquiries') return send(200, { statuses: STATUSES, items: load() });
    const m = url.pathname.match(/^\/api\/inquiries\/(\d+)$/);
    if (req.method === 'POST' && m) { // update status / follow-up / notes / regenerate
      const d = parse(await body(req), req.headers['content-type']); const all = load(); const q = all.find(x => String(x.id) === m[1]);
      if (!q) return send(404, { error: 'not found' });
      if (STATUSES.includes(d.status)) q.status = d.status;
      if (d.followUp !== undefined) q.followUp = clean(d.followUp, 20);
      if (d.draft !== undefined) q.draft = clean(d.draft, 20000);
      save(all);
      if (d.regenerate) makeDraft(q.id);
      return send(200, { ok: true });
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/inquiries.html'))
      return send(200, fs.readFileSync(path.join(__dirname, 'inquiries.html')), 'text/html');
    send(404, { error: 'not found' });
  } catch (e) { send(500, { error: e.message }); }
});
server.listen(PORT, '::', () => console.log(`Zion Luxe (private) on http://localhost:${PORT} and over Tailscale on port ${PORT}`));
if (process.env.SCRAPE !== 'off') require('./scraper').start({ load, save, makeDraft, seenFile }, (m) => console.log(new Date().toLocaleTimeString(), m));
