'use strict';
const { createHash, timingSafeEqual } = require('node:crypto');
// Add a distinct password hash and destination for each additional client.
// This is a casual preview gate: the public app and public repository are not private.
const clients = [{ path: '/alessandrocaffe', hash: Buffer.from('23f80d877c2d7284e4ea86512513f62e6a1c18f024e84aef18a9b732ee7af37b', 'hex') }];
function findClient(password) {
  const candidate = createHash('sha256').update(typeof password === 'string' ? password : '').digest();
  return clients.find(client => timingSafeEqual(candidate, client.hash));
}
async function readPassword(req) {
  let body = req.body;
  if (body === undefined) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 4096) return null;
    }
    body = raw;
  }
  return (typeof body === 'string' ? new URLSearchParams(body).get('password') : body && body.password) || '';
}
module.exports = { findClient, readPassword };
