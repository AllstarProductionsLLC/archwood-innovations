'use strict';
const { findClient, readPassword } = require('../lib/client-portal.cjs');
const embedded = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Alessandro Caffe</title><style>html,body{width:100%;height:100%;margin:0}iframe{display:block;width:100%;height:100%;height:100dvh;border:0}</style></head><body><iframe src="https://alessandrocaffe.vercel.app/" title="Alessandro Caffe"></iframe></body></html>`;
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method === 'GET') { res.statusCode = 303; res.setHeader('Location', '/client-portal'); return res.end(); }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); res.statusCode = 405; return res.end('Method not allowed'); }
  const password = await readPassword(req);
  if (password === null) { res.statusCode = 413; return res.end('Request too large'); }
  const client = findClient(password);
  if (!client || client.path !== '/alessandrocaffe') { res.statusCode = 303; res.setHeader('Location', '/client-portal'); return res.end(); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.end(embedded);
};
