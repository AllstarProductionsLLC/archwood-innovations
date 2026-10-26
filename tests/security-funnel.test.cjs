'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summarize}=require('../lib/security-summary.cjs');
const {createStore,ServiceError,digest,clientKey}=require('../lib/lead-store.cjs');
const {sendEmail,linkEmail,notifyOwner,reportDocument}=require('../lib/report-email.cjs');
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret',RESEND_API_KEY:'mail-secret',REPORT_FROM_EMAIL:'Archwood <reports@archwoodinnovations.com>',PUBLIC_SITE_URL:'https://archwoodinnovations.com',LEAD_NOTIFICATION_EMAIL:'owner@company.com'};
function fixture({gaps=0,php='unknown',observations=[]}={}){return{target:'https://company.com/',finalUrl:'https://company.com/',generatedAt:new Date().toISOString(),mode:'quick',checks:Array.from({length:6},(_,i)=>({id:String(i),title:'Protection '+i,status:i<gaps?'gap':'observed',detail:'Evidence needs context',evidence:'A returned header',confidence:'High: observation',url:'https://company.com/'})),observations,php:{state:php,summary:'Not disclosed',advisories:[{id:'CVE-2026-109618',status:php,url:'https://www.php.net/',explanation:'Potential indication'}],configurationAdvisory:{id:'CVE-2026-115560',url:'https://www.php.net/',explanation:'Unknown'},fixes:'Advisory baselines',reviewed:'2026-10-25'},coverage:{pagesReviewed:1},pages:[],skipped:[],limitations:['Limited coverage']};}
test('result tone follows evidence; missing headers never become proof of critical danger',()=>{
 assert.equal(summarize(fixture()).tone,'positive');assert.equal(summarize(fixture({gaps:2})).tone,'balanced');assert.equal(summarize(fixture({gaps:5})).tone,'attention');assert.equal(summarize(fixture({php:'potential'})).tone,'priority');
 assert.match(summarize(fixture({php:'potential'})).body,/Banners can be inaccurate/);
 assert.match(summarize(fixture()).caveat,/does not rule out/);
 assert.equal(summarize(fixture()).grade,undefined);
});
test('expanded summary uses weakest result per control and does not multiply gaps by pages',()=>{
 const report=fixture();report.checks.push({...report.checks[0],status:'gap'});const result=summarize(report);assert.equal(result.total,6);assert.equal(result.gaps,1);assert.equal(result.observed,5);
});
test('stored addresses are normalized elsewhere; short-lived client keys contain no raw IP or credentials',()=>{
 const a=clientKey({headers:{'x-forwarded-for':'203.0.113.55'}},env);const b=clientKey({headers:{'x-forwarded-for':'203.0.113.56'}},env);assert.notEqual(a,b);assert.match(a,/^[a-f0-9]{64}$/);assert.equal(a.includes('203.0.113'),false);
});
test('database calls keep service-role keys server-side and map rate limits without leaking errors',async()=>{
 let sent;const store=createStore({env,fetchImpl:async(url,options)=>{sent={url,options};return new Response(JSON.stringify({message:'RATE_LIMIT private details'}),{status:400});}});
 await assert.rejects(store.rpc('security_start_scan',{p_url:'https://company.com/'}),error=>error instanceof ServiceError&&error.status===429&&!error.message.includes('private details'));
 assert.equal(sent.options.headers.apikey,'server-secret');assert.equal(sent.url,'https://project.supabase.co/rest/v1/rpc/security_start_scan');
});
test('expired and unopened links cannot retrieve reports even if their token hash exists',async()=>{
 for(const record of [{verified_at:null,expires_at:'2999-01-01'},{verified_at:'2026-01-01',expires_at:'2020-01-01'}]){const store=createStore({env,fetchImpl:async()=>new Response(JSON.stringify([record]))});await assert.rejects(store.access('a'.repeat(64)),error=>error.status===410);}
});
test('email payload uses trusted base URLs, private fragments, and no hidden BCC or marketing enrollment',()=>{
 const message=linkEmail('lead@company.com','a'.repeat(64),{website_url:'https://company.com/'},env);
 assert.match(message.text,/website-security#report=/);assert.equal(message.bcc,undefined);assert.match(message.text,/not been subscribed/);
 const preview=linkEmail('lead@company.com','a'.repeat(64),{website_url:'https://company.com/'},{...env,PUBLIC_SITE_URL:'',VERCEL_ENV:'preview',VERCEL_URL:'review.vercel.app'});assert.match(preview.text,/https:\/\/review.vercel.app\/website-security/);
});
test('Resend uses an idempotency key and only reports provider acceptance after a real response',async()=>{
 let sent;const id=await sendEmail({to:['lead@company.com']},'request-id',{env,fetchImpl:async(url,options)=>{sent={url,options};return new Response('{"id":"provider-id"}');}});
 assert.equal(id,'provider-id');assert.equal(sent.options.headers['Idempotency-Key'],'request-id');
 await assert.rejects(sendEmail({},'request-id',{env,fetchImpl:async()=>new Response('{}',{status:422})}),/did not accept/);
});
test('owner notifications contain lead context but never private access tokens, and failed sends stay visible',async()=>{
 const updates=[];let payload;const access={id:'access',lead_id:'lead',wants_help:true};
 const store={rpc:async()=>true,request:async()=>[{email:'lead@company.com'}],updateAccess:async(id,value)=>updates.push(value)};
 await notifyOwner(store,access,{website_url:'https://company.com/',summary:{label:'Attention recommended'}},{env,fetchImpl:async(url,options)=>{payload=JSON.parse(options.body);return new Response('{"id":"mail"}');}});
 assert.match(payload.text,/Requested help: Yes/);assert.equal(payload.text.includes('#report='),false);assert.equal(updates.at(-1).notification_status,'accepted');
 await notifyOwner(store,access,{website_url:'https://company.com/',summary:{label:'Attention recommended'}},{env,fetchImpl:async()=>new Response('{}',{status:500})});assert.equal(updates.at(-1).notification_status,'failed');
});
test('HTML report escapes target-controlled content and remains an honest, non-scriptable document',()=>{
 const report=fixture();report.checks[0].evidence='<script>alert(1)</script>';report.observations=[{title:'<img src=x onerror=alert(1)>',evidence:'<svg onload=alert(1)>'}];
 const html=reportDocument(report,summarize(report));assert.equal(html.includes('<script>'),false);assert.match(html,/&lt;script&gt;/);assert.match(html,/default-src 'none'/);assert.match(html,/Initial public checks/);
});
test('missing persistence configuration cannot silently fall back to unrecorded scans',()=>{
 assert.throws(()=>createStore({env:{}}),error=>error.status===503);
 assert.equal(digest('token').length,64);
});
