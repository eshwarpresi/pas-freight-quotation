// Vercel serverless function: /api/dsr
// Sits between the Quotation page and the PAS Freight DSR so the secret key stays on the server
// (Vercel Environment Variable DSR_KEY) and staff never have to type it.
const API = (process.env.DSR_API || 'https://pas-freight-api.onrender.com').replace(/\/$/, '');

const ALLOWED = [
  { method: 'GET',  re: /^\/shipment\/[A-Za-z0-9._\-]{5,40}$/ },
  { method: 'POST', re: /^\/shipment\/[A-Za-z0-9._\-]{5,40}\/stage$/ },
  { method: 'POST', re: /^\/quotation\/nominated$/ },
];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Use POST' });
  const key = process.env.DSR_KEY;
  if (!key) return res.status(500).json({ status: 'error', message: 'DSR_KEY is not set in Vercel yet.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const { path, method, payload } = body || {};
  const m = String(method || 'GET').toUpperCase();
  if (!ALLOWED.some((a) => a.method === m && a.re.test(String(path || '')))) {
    return res.status(400).json({ status: 'error', message: 'Not allowed' });
  }
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const r = await fetch(API + '/api/integrations' + path, {
      method: m,
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, ...(ip ? { 'x-forwarded-for': ip } : {}) },
      body: m === 'POST' ? JSON.stringify(payload || {}) : undefined,
    });
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json').send(text || '{}');
  } catch (e) {
    res.status(502).json({ status: 'error', message: 'DSR server is waking up. Please try again in 20 seconds.' });
  }
};