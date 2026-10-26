'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summarize}=require('../lib/security-summary.cjs');
const {createStore,ServiceError,digest,clientKey}=require('../lib/lead-store.cjs');
const {sendEmail,linkEmail,notifyOwner,ownerEmail,reportDocument}=require('../lib/report-email.cjs');
const {FakeFirestore}=require('./helpers/firestore.cjs');
const {mime}=require('../lib/google-mail.cjs');
const env={GCP_PROJECT_ID:'security-project',GCP_AUTH_MODE:'adc',RATE_LIMIT_SECRET:'r'.repeat(32),GMAIL_OAUTH_CLIENT_ID:'client',GMAIL_OAUTH_CLIENT_SECRET:'secret',GMAIL_OAUTH_REFRESH_TOKEN:'refresh',GMAIL_SENDER_EMAIL:'reports@archwoodinnovations.com',REPORT_FROM_EMAIL:'Archwood <reports@archwoodinnovations.com>',PUBLIC_SITE_URL:'https://archwoodinnovations.com',LEAD_NOTIFICATION_EMAIL:'owner@company.com'};
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
test('Firestore rate limits are shared across store instances and enforced before scan logging',async()=>{
 const db=new FakeFirestore(),a=createStore({env,db}),b=createStore({env,db});
 const results=await Promise.allSettled(Array.from({length:8},(_,i)=>(i%2?a:b).rpc('security_start_scan',{p_url:'https://company.com/',p_client:'client',p_bearer:'hash',p_mode:'quick'})));
 assert.equal(results.filter(result=>result.status==='fulfilled').length,5);
 assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.status===429).length,3);
 assert.equal([...db.rows.keys()].filter(key=>key.startsWith('security_scans/')).length,5);
});
test('email payload uses trusted base URLs, private fragments, and no hidden BCC or marketing enrollment',()=>{
 const message=linkEmail('lead@company.com','a'.repeat(64),{website_url:'https://company.com/'},env);
 assert.match(message.text,/website-security#report=/);assert.equal(message.bcc,undefined);assert.match(message.text,/not been subscribed/);
 const preview=linkEmail('lead@company.com','a'.repeat(64),{website_url:'https://company.com/'},{...env,PUBLIC_SITE_URL:'',VERCEL_ENV:'preview',VERCEL_URL:'review.vercel.app'});assert.match(preview.text,/https:\/\/review.vercel.app\/website-security/);
});
test('Gmail records acceptance and deduplicates an accepted send without retrying the API',async()=>{
 const db=new FakeFirestore();let sent,calls=0;const payload={from:env.REPORT_FROM_EMAIL,to:['lead@company.com'],subject:'Report',text:'Your report',html:'<p>Your report</p>'};
 const options={env,db,authClient:{getAccessToken:async()=>({token:'access'})},fetchImpl:async(url,options)=>{sent={url,options};calls++;return new Response('{"id":"gmail-id","threadId":"thread"}');}};
 assert.equal(await sendEmail(payload,'request-id',options),'gmail-id');assert.equal(await sendEmail(payload,'request-id',options),'gmail-id');assert.equal(calls,1);
 assert.match(sent.url,/gmail.googleapis.com/);assert.equal(sent.options.headers.Authorization,'Bearer access');
 const row=[...db.rows.values()][0];assert.equal(row.status,'accepted');assert.equal(row.recipient,'lead@company.com');assert.equal(row.gmail_thread_id,'thread');assert.equal(row.raw,undefined);
});
test('Gmail MIME encoding is base64url, includes a stable Message-ID, and rejects header injection',()=>{
 const payload={from:env.REPORT_FROM_EMAIL,to:['lead@company.com'],subject:'A clearer view',text:'Plain text',html:'<p>Report</p>'};
 const built=mime(payload,'request-id',new Date());const message=Buffer.from(built.raw,'base64url').toString('utf8');
 assert.match(message,/Message-ID: </);assert.match(message,/multipart\/alternative/);assert.match(message,/To: lead@company.com/);assert.equal(message.includes('Bcc:'),false);
 assert.equal(mime(payload,'request-id',new Date()).messageId,built.messageId);
 assert.throws(()=>mime({...payload,to:['lead@company.com\r\nBcc: attacker@bad.com']},'key',new Date()),/invalid/);
});
test('ambiguous Gmail failures are recorded and never automatically sent again',async()=>{
 const db=new FakeFirestore();let calls=0;const payload={from:env.REPORT_FROM_EMAIL,to:['lead@company.com'],subject:'Report',text:'Link'};
 const options={env,db,authClient:{getAccessToken:async()=>({token:'access'})},fetchImpl:async()=>{calls++;throw Error('Connection lost');}};
 await assert.rejects(sendEmail(payload,'unknown-send',options),/could not confirm/);
 assert.equal([...db.rows.values()][0].status,'unknown');
 await assert.rejects(sendEmail(payload,'unknown-send',options),error=>error.status===409);assert.equal(calls,1);
});
test('HTML report escapes target-controlled content and remains an honest, non-scriptable document',()=>{
 const report=fixture();report.checks[0].evidence='<script>alert(1)</script>';report.observations=[{title:'<img src=x onerror=alert(1)>',evidence:'<svg onload=alert(1)>'}];
 const html=reportDocument(report,summarize(report));assert.equal(html.includes('<script>'),false);assert.match(html,/&lt;script&gt;/);assert.match(html,/default-src 'none'/);assert.match(html,/Initial public checks/);
});
test('missing persistence configuration cannot silently fall back to unrecorded scans',()=>{
 assert.throws(()=>createStore({env:{}}),error=>error.status===503);
 assert.equal(digest('token').length,64);
});

test('owner notifications distinguish requested help and include escaped report evidence without access tokens',()=>{
 const report=fixture({gaps:2});report.checks[0].evidence='<img src=x onerror=alert(1)>';const scan={website_url:'https://company.com/',report,summary:summarize(report)};
 const access={id:'request-id',wants_help:true,token_hash:'private-hash',reportToken:'private-token'};
 const message=ownerEmail('lead@company.com',access,scan,env);
 assert.equal(message.subject,'[HELP REQUESTED] Website security: company.com');
 assert.equal(message.replyTo,'lead@company.com');assert.match(message.text,/asked Archwood to contact/);assert.match(message.text,/Protection 0/);assert.match(message.text,/CVE-2026-109618/);assert.match(message.text,/Confidence: High: observation/);assert.match(message.text,/does not rule out/);
 assert.match(message.html,/mailto:lead@company.com/);assert.match(message.html,/&lt;img/);assert.equal(message.html.includes('<img'),false);
 const raw=Buffer.from(mime(message,'owner-test',new Date()).raw,'base64url').toString();assert.match(raw,/Reply-To: lead@company.com/);assert.throws(()=>mime({...message,replyTo:'lead@company.com\r\nBcc: attacker@bad.com'},'bad',new Date()),/invalid/);
 assert.equal(JSON.stringify(message).includes('private-token'),false);assert.equal(JSON.stringify(message).includes('private-hash'),false);
 const ordinary=ownerEmail('lead@company.com',{...access,wants_help:false},scan,env);assert.equal(ordinary.subject,'[REPORT OPENED] Website security: company.com');assert.match(ordinary.text,/did not request contact/);
});
test('owner notifications remain useful when detailed evidence has expired',()=>{
 const report=fixture(),message=ownerEmail('lead@company.com',{id:'request-id',wants_help:true},{website_url:report.target,summary:summarize(report)},env);
 assert.match(message.text,/Detailed evidence has expired or is unavailable/);assert.match(message.text,/basic protections observed/);
});

test('email report opening renders the full report before focusing and scrolling to the unlocked detailed report heading',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require.resolve('../dist/security.js'),'utf8');
 const start=source.indexOf(' async function openLink(){'),end=source.indexOf('\n if(designPreview)',start);
 for(const fails of [false,true]){
  const events=[],frames=[];let cleaned;
  const context={URLSearchParams,location:{hash:'#report=private-token',pathname:'/website-security',search:''},history:{replaceState:(_a,_b,url)=>{cleaned=url;}},document:{createElement:()=>({}),head:{append:()=>{}}},error:{},consoleState:{},reportToken:null,
   reportRequest:async payload=>{assert.equal(payload.reportToken,'private-token');if(fails)throw Error('Expired link');return{summary:{},report:{},expanded:false};},
   renderSnapshot:(_summary,move)=>{assert.equal(move,false);events.push('snapshot');},renderFull:()=>events.push('full'),requestAnimationFrame:fn=>frames.push(fn),$:selector=>{if(selector==='#full-report')return{focus:options=>{assert.equal(options.preventScroll,true);events.push('focus');}};assert.equal(selector,'.full-report-heading');return{scrollIntoView:options=>{assert.equal(options.block,'start');assert.equal(options.behavior,'instant');events.push('scroll');}};}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);await context.openLink();assert.equal(cleaned,'/website-security');
  if(fails){assert.equal(frames.length,0);assert.equal(context.error.hidden,false);}
  else{assert.deepEqual(events,['snapshot','full']);frames.forEach(fn=>fn());assert.deepEqual(events,['snapshot','full','focus','scroll']);}
 }
});
