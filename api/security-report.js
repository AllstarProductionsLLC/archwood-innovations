'use strict';
const {readRequest,failure}=require('../lib/api-request.cjs');
const {createStore,clientKey,digest,token,validId,validToken,ServiceError}=require('../lib/lead-store.cjs');
const {emailReady,linkEmail,sendEmail,notifyOwner,reportDocument}=require('../lib/report-email.cjs');
module.exports=async function handler(req,res){
 try{
  const body=await readRequest(req,res);
  if(!['request','open','download'].includes(body.action))throw new ServiceError('Invalid report action.',400);
  const store=createStore();
  if(body.action==='request'){
   emailReady();
   const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
   if(!validId(body.scanId)||!validToken(body.scanToken)||email.length>254||!/^[^\s@<>"\\(),;:]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(email)||body.fax)throw new ServiceError('Enter a valid email address and run a new quick check if your report has expired.',400);
   const raw=token();
   const access=await store.rpc('security_request_report',{p_scan:body.scanId,p_bearer:digest(body.scanToken),p_email:email,p_token:digest(raw),p_client:clientKey(req),p_help:body.wantsHelp===true});
   const scan=await store.getScan(body.scanId);
   // Unknown is persisted before submission so a successful email remains usable if acknowledgment saving fails.
   await store.updateAccess(access.id,{email_status:'unknown'});
   let id;
   try{id=await sendEmail(linkEmail(email,raw,scan),'report-'+access.id);}
   catch(error){if(error.emailRejected)await store.updateAccess(access.id,{email_status:'failed'}).catch(()=>{});throw error;}
   await store.updateAccess(access.id,{email_status:'accepted',provider_id:id}).catch(()=>{});
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({accepted:true,message:'Your report link was accepted for email delivery. Check your inbox and spam folder. Open the link to unlock your report and expanded review.'}));return;
  }
  const {access,scan}=await store.access(body.reportToken,{verify:body.action==='open'});
  if(body.action==='download'){
   res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="archwood-website-security-report.html"');res.end(reportDocument(scan.report,scan.summary));return;
  }
  await notifyOwner(store,access,scan).catch(()=>{});
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({report:scan.report,summary:scan.summary,expanded:access.expansion_status==='completed'}));
 }catch(error){failure(res,error);}
};
