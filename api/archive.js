// Vercel serverless function: /api/archive
// One shared archive of every saved quotation, for the whole team (stored in Turso).
// Needs these Vercel Environment Variables:
//   TURSO_URL      e.g. libsql://pas-quotations-yourname.turso.io
//   TURSO_TOKEN    a token for that database
//   ARCHIVE_PASS   (recommended) a team passcode; the page asks for it once per browser
const crypto = require('crypto');

const BASE = String(process.env.TURSO_URL || '').replace(/^libsql:\/\//, 'https://').replace(/\/$/, '');
const TOKEN = process.env.TURSO_TOKEN || '';
const PASS = process.env.ARCHIVE_PASS || '';

const arg = (v) => {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v };
  return { type: 'text', value: String(v) };
};

async function run(stmts) {
  const body = { requests: [...stmts.map((s) => ({ type: 'execute', stmt: { sql: s.sql, args: (s.args || []).map(arg) } })), { type: 'close' }] };
  const r = await fetch(BASE + '/v2/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j && j.error) || 'Database error ' + r.status);
  return j.results.slice(0, stmts.length).map((res) => {
    if (res.type !== 'ok') throw new Error((res.error && res.error.message) || 'Database error');
    const rs = res.response.result;
    return rs.rows.map((row) => {
      const o = {};
      rs.cols.forEach((c, i) => {
        const cell = row[i];
        o[c.name] = !cell || cell.type === 'null' ? null : cell.type === 'integer' ? Number(cell.value) : cell.value;
      });
      return o;
    });
  });
}

let ready = null;
const setup = () => {
  if (!ready) {
    ready = run([
      { sql: 'CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, updated_at INTEGER, deleted INTEGER DEFAULT 0, purged INTEGER DEFAULT 0, saved_by TEXT, data TEXT, preview TEXT)' },
      { sql: 'CREATE INDEX IF NOT EXISTS quotes_updated ON quotes(updated_at)' },
    ]).catch((e) => { ready = null; throw e; });
  }
  return ready;
};

const sameText = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Use POST' });
  if (!BASE || !TOKEN) return res.status(501).json({ status: 'error', code: 'not_set_up', message: 'The shared archive is not set up yet (TURSO_URL / TURSO_TOKEN missing in Vercel).' });
  if (PASS && !sameText(req.headers['x-archive-pass'] || '', PASS)) {
    return res.status(401).json({ status: 'error', code: 'passcode', message: 'Team passcode needed' });
  }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};

  try {
    await setup();
    const now = Date.now();

    if (b.action === 'ping') return res.json({ status: 'success' });

    if (b.action === 'list') {
      const since = Math.max(0, Number(b.since) || 0);
      const [rows] = await run([{ sql: 'SELECT id, updated_at, purged, data FROM quotes WHERE updated_at > ? ORDER BY updated_at ASC LIMIT 200', args: [since] }]);
      const entries = [], purged = [];
      let bytes = 0, cursor = since, more = false;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (i > 0 && bytes + (r.data || '').length > 3000000) { more = true; break; }
        bytes += (r.data || '').length;
        cursor = r.updated_at;
        if (r.purged) { purged.push(r.id); continue; }
        try { entries.push(JSON.parse(r.data)); } catch (e) { /* skip a damaged row */ }
      }
      if (!more && rows.length >= 200) more = true;
      return res.json({ status: 'success', entries, purged, cursor, more });
    }

    if (b.action === 'upsert') {
      const e = b.entry;
      if (!e || !e.id || typeof e.id !== 'string' || e.id.length > 80) return res.status(400).json({ status: 'error', message: 'Bad quotation' });
      const preview = typeof b.preview === 'string' && b.preview.startsWith('data:image/') && b.preview.length < 1500000 ? b.preview : null;
      const data = JSON.stringify(e);
      await run([{
        sql: `INSERT INTO quotes (id, updated_at, deleted, purged, saved_by, data, preview) VALUES (?, ?, ?, 0, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, deleted = excluded.deleted, saved_by = excluded.saved_by,
                data = excluded.data, preview = COALESCE(excluded.preview, quotes.preview)
              WHERE quotes.purged = 0`,
        args: [e.id, now, e.deleted ? 1 : 0, String(e.savedBy || '').slice(0, 80), data, preview],
      }]);
      return res.json({ status: 'success', updatedAt: now });
    }

    if (b.action === 'purge') {
      const id = String(b.id || '');
      if (!id || id.length > 80) return res.status(400).json({ status: 'error', message: 'Bad id' });
      await run([{
        sql: `INSERT INTO quotes (id, updated_at, deleted, purged, saved_by, data, preview) VALUES (?, ?, 1, 1, '', '{}', NULL)
              ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, purged = 1, deleted = 1, data = '{}', preview = NULL`,
        args: [id, now],
      }]);
      return res.json({ status: 'success' });
    }

    if (b.action === 'preview') {
      const id = String(b.id || '');
      const [rows] = await run([{ sql: 'SELECT preview FROM quotes WHERE id = ? AND purged = 0', args: [id] }]);
      return res.json({ status: 'success', preview: rows[0] ? rows[0].preview : null });
    }

    return res.status(400).json({ status: 'error', message: 'Unknown action' });
  } catch (e) {
    console.error('archive api failed:', e && e.message);
    return res.status(502).json({ status: 'error', message: 'The shared archive could not be reached. Try again in a moment.' });
  }
};