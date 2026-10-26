'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isPublicIP, normalizeTarget, validateUrl, resolvePublic, safeFetch, pinnedLookup } = require('../lib/safe-request.cjs');
const { runReview, phpReview, linkedPages, checkPage, observations } = require('../lib/security-review.cjs');
const publicLookup = async () => [{ address:'93.184.215.14',family:4 }];
const headers = { 'content-type':'text/html', 'strict-transport-security':'max-age=31536000', 'content-security-policy':"default-src 'self'; frame-ancestors 'none'", 'x-content-type-options':'nosniff', 'referrer-policy':'strict-origin-when-cross-origin' };
const page = (overrides = {}) => ({ url:'https://company.com/',status:200,headers:{...headers},body:'<html><a href="/about">About</a><a href="/contact">Contact</a></html>',truncated:false,...overrides });
test('normalizes a domain or HTTP input to the HTTPS homepage and drops actions and queries', () => {
  assert.equal(normalizeTarget('company.com/path?delete=1#now').href,'https://company.com/');
  assert.equal(normalizeTarget('http://company.com/').href,'https://company.com/');
});
test('rejects private spellings, credentials, non-web protocols, and custom ports', () => {
  for (const value of ['localhost','https://127.0.0.1','https://2130706433','https://0x7f000001','https://[::ffff:127.0.0.1]','https://user:pass@company.com','https://company.com:8443','file:///etc/passwd','https://foo.internal','https://company.com.']) assert.throws(() => normalizeTarget(value),undefined,value);
  assert.throws(() => validateUrl('http://company.com/'));
});
test('public address classification rejects reserved IPv4/IPv6 and transition ranges', () => {
  for (const address of ['0.0.0.0','10.1.2.3','100.64.0.2','127.0.0.1','169.254.169.254','172.20.1.1','192.168.1.1','192.0.2.1','198.18.1.1','224.0.0.1','255.255.255.255','::1','::','fc00::1','fe80::1','::ffff:8.8.8.8','2002:0808:0808::1','2001:db8::1','3fff::1']) assert.equal(isPublicIP(address),false,address);
  for (const address of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111']) assert.equal(isPublicIP(address),true,address);
});
test('mixed public/private DNS answers are refused before any request', async () => {
  let calls = 0;
  await assert.rejects(safeFetch('https://company.com/',{ lookup:async () => [{ address:'8.8.8.8',family:4 },{ address:'10.0.0.1',family:4 }],request:async () => { calls++; } }),/public internet/);
  assert.equal(calls,0);
});
test('validated addresses are pinned, including Node all-address lookup', async () => {
  const records = await resolvePublic('company.com',publicLookup);
  const lookup = pinnedLookup(records);
  await new Promise((resolve,reject) => lookup('company.com',{ all:true },(error,result) => { if (error) return reject(error);assert.deepEqual(result,records);resolve(); }));
  await new Promise(resolve => lookup('company.com',4,(error,address,family) => { assert.equal(error,null);assert.equal(address,records[0].address);assert.equal(family,4);resolve(); }));
});
test('redirects to metadata servers and HTTPS downgrades never issue a second request', async () => {
  for (const target of ['https://169.254.169.254/latest','http://company.com/']) {
    let count = 0;
    await assert.rejects(safeFetch('https://company.com/',{ lookup:publicLookup,request:async () => { count++;return { status:302,headers:{ location:target } }; } }));
    assert.equal(count,1);
  }
});
test('DNS rebinding on a redirect is stopped and first request receives the validated address', async () => {
  let lookups = 0, requests = 0;
  await assert.rejects(safeFetch('https://company.com/',{ lookup:async () => ++lookups === 1 ? publicLookup() : [{ address:'127.0.0.1',family:4 }], request:async (url,records) => { requests++;assert.equal(records[0].address,'93.184.215.14');return { status:302,headers:{ location:'/about' } }; } }),/public internet/);
  assert.equal(requests,1);
});
test('expanded page redirects cannot escape the final origin', async () => {
  await assert.rejects(safeFetch('https://company.com/about',{sameOrigin:'https://company.com',lookup:publicLookup,request:async () => ({ status:302,headers:{ location:'https://other.com/' } })}),/left the assessed/);
});
test('DNS deadline cancels a hung resolver', async () => {
  const controller = new AbortController();
  const promise = resolvePublic('company.com',() => new Promise(() => {}),controller.signal);
  controller.abort();
  await assert.rejects(promise);
});
test('quick review produces real graded checks and no PHP assurance for hidden versions', async () => {
  const stages = [];let count = 0;
  const report = await runReview('company.com','quick',{ fetchPage:async () => { count++;return page(); },emit:event => stages.push(event.stage) });
  assert.equal(count,1);assert.equal(report.score,100);assert.equal(report.grade,'A');assert.equal(report.php.state,'unknown');
  assert.equal(report.checks.length,6);assert.deepEqual(stages,[0,1,2,3,4,5]);
});
test('an unassessable response never receives a grade', async () => {
  for (const fixture of [page({status:403}),page({headers:{'content-type':'application/json'}}),page({status:500})]) await assert.rejects(runReview('company.com','quick',{fetchPage:async () => fixture}),/No grade/);
});
test('expanded review only fetches bounded informational links and uses weakest control', async () => {
  const calls = [];
  const report = await runReview('company.com','expanded',{fetchPage:async url => { calls.push(url); return calls.length === 1 ? page() : page({url,headers:{'content-type':'text/html'}}); }});
  assert.equal(calls.length,3);assert.equal(report.score,20);assert.equal(report.grade,'F');assert.equal(report.coverage.pagesReviewed,3);
  assert.equal(linkedPages(page({body:'<a href="/logout">x</a><a href="/contact?delete=1">x</a><a href="https://other.com/about">x</a><a href="/about">x</a>'})).length,1);
});
test('PHP critical-advisory rules handle each fix boundary without certifying patch status', () => {
  for (const [branch,fix] of [['8.2',35],['8.3',36],['8.4',27],['8.5',12]]) {
    const prior = phpReview([page({headers:{'x-powered-by':`PHP/${branch}.${fix-1}`}})]);
    const fixed = phpReview([page({headers:{'x-powered-by':`PHP/${branch}.${fix}`}})]);
    assert.equal(prior.state,'potential');assert.equal(fixed.state,'no-version-match');
    assert.equal(fixed.configurationAdvisory.status,'unknown');
  }
});
test('WordPress, hidden, distributor, conflicting and prerelease banners stay unknown', () => {
  for (const pages of [[page({body:'<img src="/wp-content/icon.png">'})],[page({headers:{'x-powered-by':'PHP'}})],[page({headers:{'x-powered-by':'PHP/8.2.1-ubuntu'}})],[page({headers:{'x-powered-by':'PHP/8.6.0RC3'}})],[page({headers:{'x-powered-by':'PHP/8.3.35'}}),page({headers:{'x-powered-by':'PHP/8.3.36'}})]]) assert.equal(phpReview(pages).state,'unknown');
  assert.equal(phpReview([page({headers:{'x-powered-by':'PHP/7.4.33'}})]).state,'potential');
});
test('report-only CSP, zero-age HSTS and permissive source policy do not pass', () => {
  const checks = checkPage(page({headers:{'content-security-policy-report-only':"default-src 'self'",'strict-transport-security':'max-age=0'}}));
  assert.equal(checks.find(check => check.id==='csp').status,'gap');assert.equal(checks.find(check => check.id==='hsts').status,'gap');
  assert.equal(checkPage(page({headers:{'content-security-policy':'default-src *'}})).find(check => check.id==='csp').status,'gap');
});
test('cookie evidence never contains cookie values and HTTP links are only possible risks', () => {
  const result = observations([page({headers:{'set-cookie':['session=supersecret; HttpOnly']},body:'<img src="http://company.com/a.png">'})]);
  assert.equal(JSON.stringify(result).includes('supersecret'),false);assert.equal(result[0].status,'potential');
});
test('an enforced framing policy overrides X-Frame-Options, and script-src overrides default-src', () => {
  const checks=checkPage(page({headers:{'x-frame-options':'DENY','content-security-policy':"default-src 'self'; script-src *; frame-ancestors *"}}));
  assert.equal(checks.find(check=>check.id==='framing').status,'gap');
  assert.equal(checks.find(check=>check.id==='csp').status,'gap');
});
test('a 200 access challenge produces no grade', async () => {
  await assert.rejects(runReview('company.com','quick',{fetchPage:async()=>page({body:'<title>Just a moment...</title>'})}),/No grade/);
});
