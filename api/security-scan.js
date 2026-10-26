'use strict';
const { runReview } = require('../lib/security-review.cjs');
const { ScanError } = require('../lib/safe-request.cjs');
const { createHash } = require('node:crypto');
const limits = new Map();
let active = 0;
function reserve(req) {
  const now = Date.now();
  for (const [key, entry] of limits) if (entry.reset < now) limits.delete(key);
  if (limits.size > 5000) return false;
  // Vercel supplies x-forwarded-for. Retain only a short-lived hash in memory.
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const key = createHash('sha256').update(ip).digest('hex');
  const entry = limits.get(key) || { count: 0, reset: now + 600000 };
  if (entry.count >= 5 || active >= 8) return false;
  entry.count += 1; limits.set(key, entry); return true;
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  function fail(status, message) { res.statusCode = status; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ error: message })); }
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return fail(405,'Use the website assessment form to start a review.'); }
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return fail(415,'A JSON request is required.');
  if (req.headers['sec-fetch-site'] === 'cross-site') return fail(403,'Start the review from this website.');
  if (req.headers.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) return fail(403,'Start the review from this website.'); }
    catch { return fail(403,'Invalid request origin.'); }
  }
  if (Number(req.headers['content-length'] || 0) > 4096) return fail(413,'The request is too large.');
  let body;
  try {
    if (req.body !== undefined) body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    else {
      let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 4096) return fail(413,'The request is too large.'); }
      body = JSON.parse(raw);
    }
  } catch { return fail(400,'Enter a valid website address.'); }
  if (!body || JSON.stringify(body).length > 4096 || typeof body.url !== 'string' || !['quick','expanded'].includes(body.mode) || body.authorized !== true) return fail(400,'Enter a website, select a review, and confirm you have permission.');
  if (!reserve(req)) { res.setHeader('Retry-After','600'); return fail(429,'Review capacity reached. Please wait ten minutes before trying again.'); }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);
  const disconnected = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', disconnected);
  active += 1;
  res.setHeader('Content-Type','application/x-ndjson; charset=utf-8');
  res.setHeader('X-Accel-Buffering','no');
  const emit = event => { if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(event) + '\n'); };
  try {
    const report = await runReview(body.url, body.mode, { signal: controller.signal, emit });
    if (controller.signal.aborted) throw new ScanError('The review timed out. Try a quick review.', 'TIMEOUT');
    emit({ type: 'result', report });
  } catch (error) {
    emit({ type: 'error', code: error instanceof ScanError ? error.code : 'FETCH_FAILED', message: error instanceof ScanError ? error.message : controller.signal.aborted ? 'The review timed out. Try a quick review.' : 'We could not read this website securely. Check its HTTPS availability or try again later. No grade was generated.' });
  } finally {
    clearTimeout(timeout); active -= 1; res.off('close', disconnected); res.end();
  }
};
