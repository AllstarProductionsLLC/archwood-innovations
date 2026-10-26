'use strict';
const {createHash,createHmac,randomBytes}=require('node:crypto');
class ServiceError extends Error {constructor(message,status=503){super(message);this.status=status;}}
const digest=value=>createHash('sha256').update(value).digest('hex');
const token=()=>randomBytes(32).toString('hex');
const validToken=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const validId=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(value);
function settings(env=process.env){
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw new ServiceError('Website reviews are temporarily unavailable. Please contact Archwood for a security review.');
 const url=new URL(env.SUPABASE_URL);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new ServiceError('The review service needs configuration.');
 return {url:url.origin,key:env.SUPABASE_SERVICE_ROLE_KEY};
}
function clientKey(req,env=process.env){
 const {key}=settings(env);
 const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
 return createHmac('sha256',key).update(new Date().toISOString().slice(0,10)+'|'+ip).digest('hex');
}
function createStore({env=process.env,fetchImpl=fetch}={}){
 const config=settings(env);
 async function request(path,{method='GET',data,representation=false}={}){
  let response;
  try{response=await fetchImpl(config.url+'/rest/v1/'+path,{method,headers:{apikey:config.key,Authorization:'Bearer '+config.key,'Content-Type':'application/json',Prefer:representation?'return=representation':'return=minimal'},...(data!==undefined?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(8000)});}catch{throw new ServiceError('The review record could not be saved. Please try again later.');}
  if(!response.ok){
   const body=await response.json().catch(()=>({}));
   if(String(body.message).includes('RATE_LIMIT'))throw new ServiceError('Please wait before starting another review or requesting another email.',429);
   if(String(body.message).includes('REPORT_EXPIRED'))throw new ServiceError('This report link has expired or is unavailable. Run a new quick check.',410);
   if(String(body.message).includes('ALREADY_RUNNING'))throw new ServiceError('The expanded review is already running. Please wait.',409);
   if(String(body.message).includes('EXPANSION_LIMIT'))throw new ServiceError('The expanded review limit for this report has been reached.',429);
   throw new ServiceError('The review record could not be saved. Please try again later.');
  }
  if(response.status===204||response.headers.get('content-length')==='0')return null;
  const text=await response.text();return text?JSON.parse(text):null;
 }
 const rpc=(name,data)=>request('rpc/'+name,{method:'POST',data,representation:true});
 const updateScan=(id,data)=>request('security_scans?id=eq.'+id,{method:'PATCH',data});
 const updateAccess=(id,data)=>request('security_report_access?id=eq.'+id,{method:'PATCH',data});
 async function getScan(id){if(!validId(id))throw new ServiceError('Invalid report reference.',400);const rows=await request('security_scans?id=eq.'+id+'&select=*');if(!rows?.[0])throw new ServiceError('This report is unavailable. Run a new quick check.',410);return rows[0];}
 async function access(raw,{verify=false}={}){
  if(!validToken(raw))throw new ServiceError('This report link is invalid.',400);
  let row;
  if(verify)row=await rpc('security_verify_report',{p_token:digest(raw)});
  else{const rows=await request('security_report_access?token_hash=eq.'+digest(raw)+'&select=*');row=rows?.[0];}
  if(!row||!row.verified_at||new Date(row.expires_at)<=new Date())throw new ServiceError('This report link has expired or is unavailable. Run a new quick check.',410);
  const scan=await getScan(row.expanded_scan_id||row.scan_id);
  if(!scan.report)throw new ServiceError('The detailed report has expired. Run a new quick check.',410);
  return {access:row,scan};
 }
 return {rpc,updateScan,updateAccess,getScan,access,request};
}
module.exports={createStore,settings,clientKey,digest,token,validToken,validId,ServiceError};
