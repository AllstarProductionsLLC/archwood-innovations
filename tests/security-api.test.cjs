'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {createRequire}=require('node:module');
const {ServiceError}=require('../lib/lead-store.cjs');
const {summarize}=require('../lib/security-summary.cjs');
const fixture=()=>({target:'https://company.com/',finalUrl:'https://company.com/',generatedAt:new Date().toISOString(),mode:'quick',checks:[{id:'https',title:'HTTPS',status:'observed',severity:'info',confidence:'High',evidence:'TLS',detail:'Observed',url:'https://company.com/'}],observations:[],php:{state:'unknown',advisories:[],configurationAdvisory:{id:'test',url:'https://www.php.net/',explanation:'Unknown'},summary:'Unknown',fixes:'Selected baselines',reviewed:'2026-10-25'},coverage:{pagesReviewed:1},pages:[],skipped:[],limitations:['Initial checks']});
function load(file,overrides={}){const filename=path.resolve(file),native=createRequire(filename),module={exports:{}};vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,require:name=>Object.hasOwn(overrides,name)?overrides[name]:native(name),process,URL,AbortController,AbortSignal,Buffer,setTimeout,clearTimeout});return module.exports;}
async function withServer(handler,execute){const server=http.createServer((req,res)=>Promise.resolve(handler(req,res)).catch(()=>{res.statusCode=500;res.end('Unhandled test handler error');}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await execute(`http://127.0.0.1:${server.address().port}`);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
const post=(base,body)=>fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
function dependencies(store){return {'../lib/lead-store.cjs':{...require('../lib/lead-store.cjs'),createStore:()=>store,clientKey:()=> 'client'},'../lib/security-review.cjs':{runReview:async(url,mode,{emit})=>{emit({stage:1,message:'Read'});return {...fixture(),mode};}}};}
test('API rejects wrong methods, origins, content type, oversized requests and missing authorization',async()=>{
 await withServer(require('../api/security-scan.js'),async base=>{assert.equal((await fetch(base)).status,405);assert.equal((await fetch(base,{method:'POST',headers:{'content-type':'text/plain'},body:'{}'})).status,415);assert.equal((await fetch(base,{method:'POST',headers:{'content-type':'application/json',origin:'https://other.com'},body:'{}'})).status,403);assert.equal((await post(base,{url:'x'.repeat(5000),mode:'quick',authorized:true})).status,413);assert.equal((await post(base,{url:'company.com',mode:'quick',authorized:false})).status,400);});
});
test('invalid targets produce no report or network review',async()=>{
 await withServer(require('../api/security-scan.js'),async base=>{const response=await post(base,{url:'https://127.0.0.1',mode:'quick',authorized:true});assert.equal(response.status,400);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('x-robots-tag'),/noindex/);assert.equal((await response.json()).report,undefined);});
});
test('free scan persists before scanning and returns summary only, never hidden report data',async()=>{
 const calls=[];let saved;
 const store={rpc:async(name,args)=>{calls.push(name);assert.equal(args.p_url,'https://company.com/');return{id:'scan'};},updateScan:async(id,data)=>{calls.push('save');saved=data;}};
 const handler=load('api/security-scan.js',dependencies(store));
 await withServer(handler,async base=>{const response=await post(base,{url:'company.com/action?secret=1',mode:'quick',authorized:true});const events=(await response.text()).trim().split('\n').map(JSON.parse);const result=events.at(-1);assert.equal(result.type,'result');assert.equal(result.report,undefined);assert.equal(result.summary.gaps,0);assert.equal(typeof result.scanToken,'string');assert.equal(saved.status,'completed');assert.ok(saved.report);assert.deepEqual(calls,['security_start_scan','save']);});
});
test('storage failure prevents an unrecorded scan and shared rate limits return 429',async()=>{
 for(const status of [503,429]){const store={rpc:async()=>{throw new ServiceError('Unavailable',status);}};let calls=0;const deps=dependencies(store);deps['../lib/security-review.cjs']={runReview:async()=>{calls++;}};await withServer(load('api/security-scan.js',deps),async base=>{assert.equal((await post(base,{url:'company.com',mode:'quick',authorized:true})).status,status);assert.equal(calls,0);});}
});
test('expanded scan requires a valid opened email link; a URL in the body cannot bypass it',async()=>{
 const store={access:async()=>{throw new ServiceError('Expired',410);}};
 await withServer(load('api/security-scan.js',dependencies(store)),async base=>assert.equal((await post(base,{url:'company.com',mode:'expanded',authorized:true})).status,410));
});
test('a concurrent expansion cannot release another request’s claim',async()=>{
 let changed=0;const store={access:async()=>({access:{id:'access',scan_id:'scan'}}),getScan:async()=>({website_url:'https://company.com/'}),rpc:async()=>{throw new ServiceError('Already running',409);},updateAccess:async()=>{changed++;}};
 await withServer(load('api/security-scan.js',dependencies(store)),async base=>assert.equal((await post(base,{mode:'expanded',authorized:true,reportToken:'a'.repeat(64)})).status,409));assert.equal(changed,0);
});
test('failed reviews remain recorded without exposing a report',async()=>{
 const updates=[];const store={rpc:async()=>({id:'scan'}),updateScan:async(id,data)=>updates.push(data)};const deps=dependencies(store);deps['../lib/security-review.cjs']={runReview:async()=>{throw Error('Network failure');}};
 await withServer(load('api/security-scan.js',deps),async base=>{const events=(await(await post(base,{url:'company.com',mode:'quick',authorized:true})).text()).trim().split('\n').map(JSON.parse);assert.equal(events.at(-1).type,'error');assert.equal(updates[0].status,'failed');});
});
test('email gate stores consent and returns an acceptance message, never the unlock token',async()=>{
 const updates=[];let sent,payload;
 const store={rpc:async(name,args)=>{payload=args;return{id:'access'};},getScan:async()=>({website_url:'https://company.com/'}),updateAccess:async(id,data)=>updates.push(data)};
 const deps=dependencies(store);deps['../lib/report-email.cjs']={emailReady:()=>{},linkEmail:(email,token)=>({email,token}),sendEmail:async message=>{sent=message;return'provider-id';}};
 await withServer(load('api/security-report.js',deps),async base=>{const response=await post(base,{action:'request',scanId:'12345678-1234-1234-1234-123456789abc',scanToken:'a'.repeat(64),email:'YOU@company.com',wantsHelp:true});const result=await response.json();assert.equal(result.accepted,true);assert.equal(result.report,undefined);assert.equal(JSON.stringify(result).includes(sent.token),false);assert.equal(payload.p_email,'you@company.com');assert.equal(payload.p_help,true);assert.equal(updates.at(-1).email_status,'accepted');});
});
test('provider failure does not falsely claim email acceptance',async()=>{
 const store={rpc:async()=>({id:'access'}),getScan:async()=>({website_url:'https://company.com/'}),updateAccess:async()=>{}};
 const deps=dependencies(store);deps['../lib/report-email.cjs']={emailReady:()=>{},linkEmail:()=>({}),sendEmail:async()=>{throw new ServiceError('Email unavailable');}};
 await withServer(load('api/security-report.js',deps),async base=>{const response=await post(base,{action:'request',scanId:'12345678-1234-1234-1234-123456789abc',scanToken:'a'.repeat(64),email:'you@company.com'});assert.equal(response.status,503);assert.equal((await response.json()).accepted,undefined);});
});
test('opened email links unlock full details and downloads stay token-gated',async()=>{
 let verified=false;const data=fixture(),store={access:async(raw,options)=>{if(raw!=='a'.repeat(64))throw new ServiceError('Invalid token',400);verified=options?.verify;return{access:{expansion_status:'none'},scan:{report:data,summary:summarize(data)}};}};
 const deps=dependencies(store);deps['../lib/report-email.cjs']={notifyOwner:async()=>{},reportDocument:()=>'<html>Report</html>'};
 await withServer(load('api/security-report.js',deps),async base=>{const opened=await post(base,{action:'open',reportToken:'a'.repeat(64)});assert.ok((await opened.json()).report);assert.equal(verified,true);assert.equal((await post(base,{action:'download',reportToken:'invalid'})).status,400);const download=await post(base,{action:'download',reportToken:'a'.repeat(64)});assert.match(download.headers.get('content-disposition'),/attachment/);});
});
