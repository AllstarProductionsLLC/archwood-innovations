'use strict';
const {createHash,createHmac,randomBytes,randomUUID}=require('node:crypto');
const {ServiceError}=require('./service-error.cjs');
const {firestore}=require('./google-cloud.cjs');
const digest=value=>createHash('sha256').update(value).digest('hex');
const token=()=>randomBytes(32).toString('hex');
const validToken=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const validId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(value);
function settings(env=process.env){if(!env.GCP_PROJECT_ID||!env.RATE_LIMIT_SECRET||env.RATE_LIMIT_SECRET.length<32)throw new ServiceError('Website reviews are temporarily unavailable. Please contact Archwood for a security review.');return{projectId:env.GCP_PROJECT_ID,key:env.RATE_LIMIT_SECRET};}
function clientKey(req,env=process.env){const{key}=settings(env);const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();return createHmac('sha256',key).update(new Date().toISOString().slice(0,10)+'|'+ip).digest('hex');}
function plain(value){if(value?.toDate)return value.toDate().toISOString();if(value instanceof Date)return value.toISOString();if(Array.isArray(value))return value.map(plain);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,plain(item)]));return value;}
function createStore({env=process.env,db,now=()=>Date.now()}={}){
 settings(env);db=db||firestore(env);
 const ref=(collection,id)=>db.collection(collection).doc(id);
 const date=(days,time=now())=>new Date(time+days*86400000);
 const unpack=snapshot=>snapshot.exists?plain(snapshot.data()):null;
 async function guarded(fn){try{return await fn();}catch(error){if(error instanceof ServiceError)throw error;throw new ServiceError('The review record could not be saved. Please try again later.');}}
 async function get(collection,id){return unpack(await db.collection(collection).doc(id).get());}
 async function getScan(id){if(!validId(id))throw new ServiceError('Invalid report reference.',400);const row=await guarded(()=>get('security_scans',id));if(!row)throw new ServiceError('This report is unavailable. Run a new quick check.',410);return row;}
 async function getLead(id){if(!/^[a-f0-9]{64}$/.test(id))throw new ServiceError('Invalid lead reference.',400);return guarded(()=>get('security_leads',id));}
 const updateScan=(id,data)=>guarded(()=>ref('security_scans',id).update(data));
 const updateAccess=(id,data)=>guarded(()=>ref('security_report_access',id).update(data));
 function rate(name,key,windowMs,limit,time){return{ref:ref('security_rates',digest(name+'|'+key)),windowMs,limit,time};}
 async function readRates(tx,rates){const snapshots=await Promise.all(rates.map(item=>tx.get(item.ref)));return snapshots.map((snapshot,index)=>{const rule=rates[index],events=(snapshot.data()?.events||[]).filter(time=>time>rule.time-rule.windowMs);if(events.length>=rule.limit)throw new ServiceError('Please wait before starting another review or requesting another email.',429);return{...rule,events};});}
 function writeRates(tx,rates){for(const item of rates)tx.set(item.ref,{events:[...item.events,item.time],purge_at:date(2,item.time)});}
 async function startScan(args){const time=now(),id=randomUUID();return db.runTransaction(async tx=>{
  const rates=await readRates(tx,[rate('scan-client',args.p_client,600000,5,time),rate('scan-site',args.p_url,3600000,20,time)]);
  const row={id,created_at:new Date(time),website_url:args.p_url,client_key:args.p_client,bearer_hash:args.p_bearer,mode:args.p_mode,parent_id:args.p_parent||null,status:'started',summary:null,report:null,error_code:null,details_expires_at:date(14,time),purge_at:date(90,time)};
  writeRates(tx,rates);tx.create(ref('security_scans',id),row);return plain(row);
 });}
 async function requestReport(args){const time=now(),id=randomUUID(),leadId=digest(args.p_email);return db.runTransaction(async tx=>{
  const scan=unpack(await tx.get(ref('security_scans',args.p_scan)));
  const lead=await tx.get(ref('security_leads',leadId));
  const rates=await readRates(tx,[rate('mail-email',leadId,1800000,3,time),rate('mail-client',args.p_client,3600000,5,time)]);
  if(!scan||scan.bearer_hash!==args.p_bearer||scan.status!=='completed'||!scan.report||new Date(scan.created_at).getTime()<time-86400000)throw new ServiceError('This report receipt has expired. Run a new quick check.',410);
  const row={id,created_at:new Date(time),expires_at:date(7,time),purge_at:date(90,time),scan_id:args.p_scan,lead_id:leadId,token_hash:args.p_token,client_key:args.p_client,wants_help:args.p_help===true,verified_at:null,email_status:'pending',provider_id:null,notification_status:'pending',notification_updated:null,expansion_status:'none',expansion_attempts:0,expansion_updated:null,expanded_scan_id:null};
  writeRates(tx,rates);tx.set(ref('security_leads',leadId),{id:leadId,email:args.p_email,created_at:lead.exists?lead.data().created_at:new Date(time),purge_at:date(90,time)});
  tx.create(ref('security_report_access',id),row);tx.create(ref('security_tokens',args.p_token),{access_id:id,purge_at:date(7,time)});return plain(row);
 });}
 async function tokenAccess(hash,tx){const mapping=unpack(await(tx?tx.get(ref('security_tokens',hash)):ref('security_tokens',hash).get()));if(!mapping||new Date(mapping.purge_at).getTime()<=now())throw new ServiceError('This report link has expired or is unavailable. Run a new quick check.',410);const row=unpack(await(tx?tx.get(ref('security_report_access',mapping.access_id)):ref('security_report_access',mapping.access_id).get()));if(!row||new Date(row.expires_at).getTime()<=now())throw new ServiceError('This report link has expired or is unavailable. Run a new quick check.',410);return row;}
 async function verifyReport(hash){return db.runTransaction(async tx=>{const row=await tokenAccess(hash,tx);if(!['accepted','unknown'].includes(row.email_status))throw new ServiceError('This report link is unavailable. Run a new quick check.',410);if(!row.verified_at){row.verified_at=new Date(now()).toISOString();tx.update(ref('security_report_access',row.id),{verified_at:row.verified_at});}return row;});}
 async function claimExpansion(hash){return db.runTransaction(async tx=>{const row=await tokenAccess(hash,tx);if(!row.verified_at)throw new ServiceError('Open the link in your report email first.',403);if(row.expansion_status==='completed')return row;if(row.expansion_status==='running'&&new Date(row.expansion_updated).getTime()>now()-120000)throw new ServiceError('The expanded review is already running. Please wait.',409);if(row.expansion_attempts>=2)throw new ServiceError('The expanded review limit for this report has been reached.',429);const update={expansion_status:'running',expansion_attempts:row.expansion_attempts+1,expansion_updated:new Date(now()).toISOString()};tx.update(ref('security_report_access',row.id),update);return{...row,...update};});}
 async function claimNotification(id){return db.runTransaction(async tx=>{const doc=ref('security_report_access',id),row=unpack(await tx.get(doc));if(!row?.verified_at||row.notification_status==='accepted'||(row.notification_status==='sending'&&new Date(row.notification_updated).getTime()>now()-300000))return false;tx.update(doc,{notification_status:'sending',notification_updated:new Date(now()).toISOString()});return true;});}
 async function access(raw,{verify=false}={}){if(!validToken(raw))throw new ServiceError('This report link is invalid.',400);const row=await guarded(()=>verify?verifyReport(digest(raw)):tokenAccess(digest(raw)));if(!row.verified_at)throw new ServiceError('Open the link in your report email first.',403);const scan=await getScan(row.expanded_scan_id||row.scan_id);if(!scan.report)throw new ServiceError('The detailed report has expired. Run a new quick check.',410);return{access:row,scan};}
 async function cleanup(){
  // Bounded batches avoid an unbounded serverless job. TTL may additionally be enabled for purge_at.
  for(const name of ['security_scans','security_leads','security_report_access','security_tokens','security_rates','security_mail']){
   const docs=await db.collection(name).where('purge_at','<=',new Date(now())).limit(200).get();if(!docs.empty){const batch=db.batch();docs.docs.forEach(doc=>batch.delete(doc.ref));await batch.commit();}
  }
  const expired=await db.collection('security_scans').where('details_expires_at','<=',new Date(now())).limit(200).get();
  if(!expired.empty){const{FieldValue}=require('@google-cloud/firestore');const batch=db.batch();expired.docs.forEach(doc=>batch.update(doc.ref,{report:null,bearer_hash:null,details_expires_at:FieldValue.delete()}));await batch.commit();}
  const stale=await db.collection('security_scans').where('status','==','started').where('created_at','<=',new Date(now()-600000)).limit(200).get();if(!stale.empty){const batch=db.batch();stale.docs.forEach(doc=>batch.update(doc.ref,{status:'cancelled',error_code:'INTERRUPTED'}));await batch.commit();}
  return true;
 }
 async function rpc(name,args){return guarded(()=>{switch(name){case'security_start_scan':return startScan(args);case'security_request_report':return requestReport(args);case'security_verify_report':return verifyReport(args.p_token);case'security_claim_expansion':return claimExpansion(args.p_token);case'security_claim_notification':return claimNotification(args.p_id);case'security_cleanup':return cleanup();default:throw new ServiceError('Unknown storage operation.',400);}});}
 return{rpc,updateScan,updateAccess,getScan,getLead,access,db};
}
module.exports={createStore,settings,clientKey,digest,token,validToken,validId,ServiceError,plain};
