'use strict';
const { findClient, readPassword } = require('../lib/client-portal.cjs');
const gate = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Client Portal | Archwood Innovations</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#05090e;color:#f3f5f7;font:16px system-ui,sans-serif}main{box-sizing:border-box;width:min(90vw,420px);padding:2.5rem;background:#0c131b;border:1px solid #24303b;border-radius:12px}p{color:#a2aebb;line-height:1.5}a{color:#62d4ff}label{display:block;margin:1.5rem 0 .5rem}input,button{box-sizing:border-box;width:100%;padding:.85rem;font:inherit;border-radius:4px}input{border:1px solid #8193a5;background:#fff;color:#05090e}button{margin-top:1rem;background:#62d4ff;color:#061019;border:0;font-weight:700;cursor:pointer}input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #62d4ff;outline-offset:3px}.error{color:#ffd3c2}</style></head><body><main><h1>Client Portal</h1><p>Enter your password to view your project.</p>ERROR<form method="post" action="/client-portal"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">Enter portal</button></form><p><a href="/">Return to Archwood Innovations</a></p></main></body></html>`;
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.method === 'GET') return res.end(gate.replace('ERROR', ''));
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); res.statusCode = 405; return res.end('Method not allowed'); }
  const password = await readPassword(req);
  if (password === null) { res.statusCode = 413; return res.end('Request too large'); }
  const client = findClient(password);
  if (!client) { res.statusCode = 401; return res.end(gate.replace('ERROR', '<p class="error" role="alert">Incorrect password. Please try again.</p>')); }
  // Preserve the POST body so the destination can verify the password itself.
  res.statusCode = 307;
  res.setHeader('Location', client.path);
  return res.end();
};
