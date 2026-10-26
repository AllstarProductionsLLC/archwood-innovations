'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStore,digest}=require('../lib/lead-store.cjs');
const {FakeFirestore}=require('./helpers/firestore.cjs');
const env={GCP_PROJECT_ID:'test-project',GCP_AUTH_MODE:'adc',RATE_LIMIT_SECRET:'r'.repeat(32)};
function setup(){let clock=Date.parse('2026-10-26T12:00:00Z');const db=new FakeFirestore(),store=createStore({env,db,now:()=>clock});return{db,store,advance:days=>{clock+=days*86400000;}};}
async function seed(store){const scan=await store.rpc('security_start_scan',{p_url:'https://company.com/',p_client:'client',p_bearer:'receipt',p_mode:'quick'});await store.updateScan(scan.id,{status:'completed',report:{example:'report'},summary:{label:'A strong start'}});const access=await store.rpc('security_request_report',{p_scan:scan.id,p_bearer:'receipt',p_email:'lead@company.com',p_token:digest('a'.repeat(64)),p_client:'client',p_help:true});return{scan,access};}
test('Firestore stores an unconfirmed email request without granting report access',async()=>{
 const{store,db}=setup();const{access}=await seed(store);assert.equal((await store.getLead(access.lead_id)).email,'lead@company.com');assert.equal(access.wants_help,true);assert.equal(db.rows.get('security_tokens/'+digest('a'.repeat(64))).access_id,access.id);
 await assert.rejects(store.access('a'.repeat(64)),error=>error.status===403);
 await assert.rejects(store.access('a'.repeat(64),{verify:true}),error=>error.status===410);
});
test('accepted or uncertain email submissions can be opened, but expired links are denied',async()=>{
 for(const status of ['accepted','unknown']){const{store,advance}=setup();const{access}=await seed(store);await store.updateAccess(access.id,{email_status:status});const opened=await store.access('a'.repeat(64),{verify:true});assert.ok(opened.access.verified_at);assert.deepEqual(opened.scan.report,{example:'report'});advance(8);await assert.rejects(store.access('a'.repeat(64)),error=>error.status===410);}
});
test('an incorrect quick-check receipt cannot create a lead or spend a mail rate slot',async()=>{
 const{store,db}=setup();const scan=await store.rpc('security_start_scan',{p_url:'https://company.com/',p_client:'client',p_bearer:'right',p_mode:'quick'});await store.updateScan(scan.id,{status:'completed',report:{}});
 await assert.rejects(store.rpc('security_request_report',{p_scan:scan.id,p_bearer:'wrong',p_email:'x@company.com',p_token:'x',p_client:'client'}),error=>error.status===410);
 assert.equal([...db.rows.keys()].some(key=>key.startsWith('security_leads/')),false);
});
test('only one expanded transaction can claim a report at a time',async()=>{
 const{store}=setup();const{access}=await seed(store);await store.updateAccess(access.id,{email_status:'accepted'});await store.access('a'.repeat(64),{verify:true});
 const attempts=await Promise.allSettled([1,2].map(()=>store.rpc('security_claim_expansion',{p_token:digest('a'.repeat(64))})));
 assert.equal(attempts.filter(item=>item.status==='fulfilled').length,1);assert.equal(attempts.find(item=>item.status==='rejected').reason.status,409);
});
test('owner notification claims are persisted and an accepted notification is not reclaimed',async()=>{
 const{store}=setup();const{access}=await seed(store);await store.updateAccess(access.id,{email_status:'accepted'});await store.access('a'.repeat(64),{verify:true});
 assert.equal(await store.rpc('security_claim_notification',{p_id:access.id}),true);assert.equal(await store.rpc('security_claim_notification',{p_id:access.id}),false);await store.updateAccess(access.id,{notification_status:'accepted'});assert.equal(await store.rpc('security_claim_notification',{p_id:access.id}),false);
});
test('retention clears detailed reports before deleting long-lived scan records',async()=>{
 const{store,db,advance}=setup();const{scan}=await seed(store);advance(15);await store.rpc('security_cleanup',{});const row=await store.getScan(scan.id);assert.equal(row.report,null);assert.equal(row.bearer_hash,null);assert.ok(row.summary);assert.equal(db.rows.has('security_tokens/'+digest('a'.repeat(64))),false);advance(76);await store.rpc('security_cleanup',{});assert.equal(db.rows.has('security_scans/'+scan.id),false);
});
