'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/alessandrocaffe.js');
async function request(method, body) {
  const res = { headers: {}, statusCode: 200, setHeader(k,v) { this.headers[k] = v; }, end(value) { this.body = value; } };
  await handler({ method, body }, res);
  return res;
}
test('password gate rejects incorrect passwords and embeds only after correct password', async () => {
  const initial = await request('GET');
  assert.match(initial.body, /name="password"/);
  assert.doesNotMatch(initial.body, /<iframe/);
  const bad = await request('POST', { password: 'family' });
  assert.equal(bad.statusCode, 401);
  assert.doesNotMatch(bad.body, /<iframe/);
  const good = await request('POST', 'password=Family');
  assert.equal(good.statusCode, 200);
  assert.match(good.body, /<iframe src="https:\/\/alessandrocaffe\.vercel\.app\/"/);
  assert.equal(good.headers['Cache-Control'], 'no-store');
  assert.equal((await request('PUT')).statusCode, 405);
});
