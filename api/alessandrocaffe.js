'use strict';
const { createHash, timingSafeEqual } = require('node:crypto');

// This gate controls the wrapper only. The independently hosted app remains public.
const passwordHash = Buffer.from('bd2d677b2ed4381b48bb1d0841052c6d076e7d634d5052e85dcbe0b8a0dedd80', 'hex');
const gate = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Alessandro Caffe</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#141b1b;color:#f6f3e9;font:16px system-ui,sans-serif}main{box-sizing:border-box;width:min(90vw,420px);padding:2.5rem;background:#202c2a;border:1px solid #40524b;border-radius:16px}p{color:#c5d0c8;line-height:1.5}label{display:block;margin:1.5rem 0 .5rem}input,button{box-sizing:border-box;width:100%;padding:.85rem;font:inherit;border-radius:6px}input{border:1px solid #81938a;background:#fff;color:#141b1b}button{margin-top:1rem;background:#cfb378;color:#17201d;border:0;font-weight:700;cursor:pointer}input:focus-visible,button:focus-visible{outline:3px solid #fff;outline-offset:3px}.error{color:#ffd3c2}</style></head><body><main><h1>Alessandro Caffe</h1><p>Enter the password to view the site.</p>ERROR<form method="post" action="/alessandrocaffe"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">Enter</button></form></main></body></html>`;
const embedded = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Alessandro Caffe</title><style>html,body{width:100%;height:100%;margin:0}iframe{display:block;width:100%;height:100%;height:100dvh;border:0}</style></head><body><iframe src="https://alessandrocaffe.vercel.app/" title="Alessandro Caffe"></iframe></body></html>`;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.statusCode = 405;
    return res.end('Method not allowed');
  }
  if (req.method === 'GET') return res.end(gate.replace('ERROR', ''));
  let body = req.body;
  if (body === undefined) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 4096) { res.statusCode = 413; return res.end('Request too large'); }
    }
    body = raw;
  }
  const password = typeof body === 'string' ? new URLSearchParams(body).get('password') : body && body.password;
  const candidate = createHash('sha256').update(typeof password === 'string' ? password : '').digest();
  if (!timingSafeEqual(candidate, passwordHash)) {
    res.statusCode = 401;
    return res.end(gate.replace('ERROR', '<p class="error" role="alert">Incorrect password. Please try again.</p>'));
  }
  return res.end(embedded);
};
