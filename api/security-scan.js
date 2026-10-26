'use strict';
const {runReview}=require('../lib/security-review.cjs');
const {normalizeTarget,ScanError}=require('../lib/safe-request.cjs');
const {summarize}=require('../lib/security-summary.cjs');
const {createStore,clientKey,digest,token,ServiceError}=require('../lib/lead-store.cjs');
const {readRequest,failure}=require('../lib/api-request.cjs');
let active=0;
module.exports=async function handler(req,res){
 let body,store,target,grant,session,raw,expansionClaimed=false;
 try{
  body=await readRequest(req,res);
  if(body.authorized!==true||!['quick','expanded'].includes(body.mode))throw new ServiceError('Confirm you have permission to review this website.',400);
  if(active>=8)throw new ServiceError('Review capacity reached. Please try again shortly.',429);
  if(body.mode==='quick')target=normalizeTarget(body.url);
  store=createStore();
  if(body.mode==='expanded'){
   grant=await store.access(body.reportToken);
   target=new URL((await store.getScan(grant.access.scan_id)).website_url);
   const claimed=await store.rpc('security_claim_expansion',{p_token:digest(body.reportToken)});
   if(claimed.expansion_status==='completed'){
    const prior=await store.getScan(claimed.expanded_scan_id);
    if(!prior.report)throw new ServiceError('This report has expired. Run a new quick check.',410);
    res.setHeader('Content-Type','application/x-ndjson');res.end(JSON.stringify({type:'result',summary:prior.summary,report:prior.report})+'\n');return;
   }
   expansionClaimed=true;
  }
  raw=token();
  session=await store.rpc('security_start_scan',{p_url:target.href,p_client:clientKey(req),p_bearer:digest(raw),p_mode:body.mode,p_parent:grant?.access.scan_id||null});
 }catch(error){
  if(expansionClaimed)await store?.updateAccess(grant.access.id,{expansion_status:'failed'}).catch(()=>{});
  if(error instanceof ScanError)error=new ServiceError(error.message,400);
  return failure(res,error);
 }
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),35000);
 const disconnect=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnect);
 active++;
 res.setHeader('Content-Type','application/x-ndjson; charset=utf-8');res.setHeader('X-Accel-Buffering','no');
 const emit=event=>{if(!res.destroyed&&!res.writableEnded)res.write(JSON.stringify(event)+'\n');};
 try{
  const report=await runReview(target.href,body.mode,{signal:controller.signal,emit});
  if(controller.signal.aborted)throw new ScanError('The review was interrupted. Try again.','TIMEOUT');
  const summary=summarize(report);
  await store.updateScan(session.id,{status:'completed',summary,report});
  if(grant){await store.updateAccess(grant.access.id,{expansion_status:'completed',expanded_scan_id:session.id});emit({type:'result',summary,report});}
  else emit({type:'result',summary,scanId:session.id,scanToken:raw});
 }catch(error){
  const code=error instanceof ScanError?error.code:controller.signal.aborted?'INTERRUPTED':'REVIEW_FAILED';
  await store.updateScan(session.id,{status:controller.signal.aborted?'cancelled':'failed',error_code:code}).catch(()=>{});
  if(grant)await store.updateAccess(grant.access.id,{expansion_status:'failed'}).catch(()=>{});
  emit({type:'error',code,message:error instanceof ScanError||error instanceof ServiceError?error.message:controller.signal.aborted?'The review was interrupted. Please try again.':'We could not read this website securely. No result was generated.'});
 }finally{clearTimeout(timeout);active--;res.off('close',disconnect);res.end();}
};
