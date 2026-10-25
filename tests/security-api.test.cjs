'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const vm = require('node:vm');
const realHandler = require('../api/security-scan.js');
async function withServer(handler, execute) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await execute(base); } finally { server.closeAllConnections();await new Promise(resolve => server.close(resolve)); }
}
test('API rejects methods, cross-site origins, oversized payloads and missing authorization', async () => {
  await withServer(realHandler,async base => {
    assert.equal((await fetch(base)).status,405);
    assert.equal((await fetch(base,{method:'POST',headers:{'content-type':'text/plain'},body:'{}'})).status,415);
    assert.equal((await fetch(base,{method:'POST',headers:{'content-type':'application/json',origin:'https://other.com'},body:'{}'})).status,403);
    assert.equal((await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'x'.repeat(5000),mode:'quick',authorized:true})})).status,413);
    assert.equal((await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'company.com',mode:'quick',authorized:false})})).status,400);
  });
});
test('invalid targets produce a streamed error with no invented report', async () => {
  await withServer(realHandler,async base => {
    const response = await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://127.0.0.1',mode:'quick',authorized:true})});
    const events = (await response.text()).trim().split('\n').map(JSON.parse);
    assert.match(response.headers.get('content-type'),/ndjson/);
    assert.equal(events.at(-1).type,'error');assert.equal(events.some(event => event.type==='result'),false);
    assert.match(response.headers.get('cache-control'),/no-store/);
  });
});
test('API streams actual stages then report, and per-instance throttling returns Retry-After', async () => {
  const moduleFixture = { exports:{} };
  const engine = async (url,mode,{emit}) => {emit({stage:0,message:'Validate'});emit({stage:1,message:'Read'});return {target:url,mode,grade:'C'};};
  vm.runInNewContext(fs.readFileSync('api/security-scan.js','utf8'),{module:moduleFixture,require:name => name.includes('security-review') ? {runReview:engine} : require(name.startsWith('../') ? '../lib/safe-request.cjs' : name),AbortController,setTimeout,clearTimeout,Buffer});
  await withServer(moduleFixture.exports,async base => {
    for (let i=0;i<5;i++) {
      const response = await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'company.com',mode:'quick',authorized:true})});
      const events=(await response.text()).trim().split('\n').map(JSON.parse);
      assert.equal(events[0].stage,0);assert.equal(events[1].stage,1);assert.equal(events[2].type,'result');
    }
    const limited=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'company.com',mode:'quick',authorized:true})});
    assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'600');
  });
});
