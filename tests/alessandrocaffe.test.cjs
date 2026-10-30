'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const portal = require('../api/client-portal.js');
const destination = require('../api/alessandrocaffe.js');
async function request(handler, method, body) {
  const res = { headers: {}, statusCode: 200, setHeader(k,v) { this.headers[k] = v; }, end(value) { this.body = value; } };
  await handler({ method, body }, res);
  return res;
}
test('portal routes the correct password and rejects incorrect and old passwords', async () => {
  assert.match((await request(portal, 'GET')).body, /Client Portal/);
  for (const password of ['Family', 'ALESSANDROCAFFE', 'wrong']) {
    const bad = await request(portal, 'POST', { password });
    assert.equal(bad.statusCode, 401);
  }
  const good = await request(portal, 'POST', 'password=alessandrocaffe');
  assert.equal(good.statusCode, 307);
  assert.equal(good.headers.Location, '/alessandrocaffe');
  assert.equal((await request(destination, 'GET')).headers.Location, '/client-portal');
  assert.equal((await request(destination, 'POST', { password: 'wrong' })).headers.Location, '/client-portal');
  const page = await request(destination, 'POST', { password: 'alessandrocaffe' });
  assert.match(page.body, /<iframe src="https:\/\/alessandrocaffe\.vercel\.app\/"/);
  assert.equal(page.headers['Cache-Control'], 'no-store');
  assert.equal((await request(portal, 'PUT')).statusCode, 405);
});
