'use strict';
const {ServiceError}=require('./lead-store.cjs');
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const {emailReady,sendGoogleEmail}=require('./google-mail.cjs');
function reportBase(env=process.env){
 const base=env.PUBLIC_SITE_URL||(env.VERCEL_ENV==='preview'&&env.VERCEL_URL?'https://'+env.VERCEL_URL:'https://archwoodinnovations.com');
 const url=new URL(base);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new ServiceError('Report email links need configuration.');
 return url.origin;
}
function linkEmail(email,raw,scan,env=process.env){
 const link=reportBase(env)+'/website-security#report='+raw;
 const host=new URL(scan.website_url).hostname;
 return {from:env.REPORT_FROM_EMAIL,to:[email],subject:'Your Archwood website security report',
  text:`Your requested website security report for ${host} is ready.\n\nOpen your private report: ${link}\n\nThe link confirms this email request and unlocks your full report, download, and one expanded public review (up to three pages). It expires in seven days. Keep it private.\n\nInitial public checks are not a security certification. If you did not request this, you can ignore this email. You have not been subscribed to marketing.\n\nArchwood Innovations | info@archwoodinnovations.com`,
  html:`<div style="background:#071019;color:#d8e6ee;padding:36px;font-family:Arial,sans-serif;max-width:620px"><p style="color:#62d4ff;letter-spacing:2px;font-size:12px">ARCHWOOD INNOVATIONS</p><h1 style="font-size:28px">Your website. A clearer view.</h1><p>Your requested security report for <strong>${escape(host)}</strong> is ready.</p><p><a href="${escape(link)}" style="display:inline-block;background:#62d4ff;color:#071019;padding:16px 22px;text-decoration:none">Open my full report ↗</a></p><p>This private link confirms your email request and unlocks the report, download, and one expanded public review of up to three pages. It expires in seven days.</p><p style="font-size:12px;color:#a1b6c4">Initial public checks are not a security certification. Findings need verification. If you did not request this, ignore this email. You have not been subscribed to marketing.</p><p>Archwood Innovations<br>info@archwoodinnovations.com</p></div>`};
}
const sendEmail=sendGoogleEmail;
async function notifyOwner(store,access,scan,{env=process.env,fetchImpl=fetch}={}){
 if(!env.LEAD_NOTIFICATION_EMAIL)return;
 if(!(await store.rpc('security_claim_notification',{p_id:access.id})))return;
 try{
  const lead=await store.getLead(access.lead_id);
  const email=lead?.email;
  if(!email)throw Error('Missing lead');
  if(access.scan_id&&store.getScan)scan=await store.getScan(access.scan_id);
  const host=new URL(scan.website_url).hostname;
  const payload={from:env.REPORT_FROM_EMAIL,to:[env.LEAD_NOTIFICATION_EMAIL],subject:`Website report opened: ${host}`,text:`A visitor opened their requested website security report.\nWebsite: ${scan.website_url}\nEmail: ${email}\nRequested help: ${access.wants_help?'Yes':'No'}\nInitial summary: ${scan.summary.label}\nReport request: ${access.id}\n\nView security_report_access and security_leads in Firestore for the lead record. This is not a marketing subscription. No private access token is included in this notification.`};
  const id=await sendEmail(payload,'owner-'+access.id,{env,fetchImpl,db:store.db});
  await store.updateAccess(access.id,{notification_status:'accepted',notification_updated:new Date().toISOString()});
  return id;
 }catch{await store.updateAccess(access.id,{notification_status:'failed',notification_updated:new Date().toISOString()}).catch(()=>{});}
}
function reportDocument(report,summary){
 const findings=[...report.checks,...report.observations];
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Archwood Website Security Report</title><style>body{font:16px/1.6 Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 24px;color:#142b3b}h1,h2{line-height:1.2}article{border-top:1px solid #b7c8d4;padding:20px 0}small{color:#536e80}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#12638c}@media print{article{break-inside:avoid}}</style></head><body><small>ARCHWOOD INNOVATIONS / WEBSITE SECURITY REVIEW</small><h1>${escape(summary.title)}</h1><p>${escape(report.finalUrl)}<br>${escape(report.generatedAt)}</p><p>${escape(summary.body)}</p><p>${summary.observed} of ${summary.total} basic protections observed across ${summary.pages} page(s). ${summary.gaps} configuration item(s) to review.</p><p>${escape(summary.caveat)}</p><h2>Findings and evidence</h2>${findings.map(item=>`<article><h3>${escape(item.title)}</h3><p>${escape(item.status)} / ${escape(item.severity)} / ${escape(item.confidence)}</p><p>${escape(item.detail)}</p><pre>${escape(item.evidence)}</pre><small>${escape(item.url)}</small></article>`).join('')}<h2>Selected PHP advisories</h2><p>${escape(report.php.summary)}</p>${[...report.php.advisories,report.php.configurationAdvisory].map(item=>`<article><h3>${escape(item.id)}</h3><p>${escape(item.status)}: ${escape(item.explanation)}</p><p>${escape(item.url)}</p></article>`).join('')}<p>${escape(report.php.fixes)}</p><p>Advisories reviewed: ${escape(report.php.reviewed)}. Not a live or complete CVE feed.</p><h2>Coverage and limitations</h2><ul>${report.limitations.map(text=>`<li>${escape(text)}</li>`).join('')}</ul>${report.pages.map(page=>`<p>Reviewed: ${escape(page.url)}${page.truncated?' (HTML truncated)':''}</p>`).join('')}${report.skipped.map(page=>`<p>Not reviewed: ${escape(page.url)} / ${escape(page.reason)}</p>`).join('')}<h2>Want a closer look?</h2><p>Contact info@archwoodinnovations.com for an authorized review, patching support, system audits, or team training.</p></body></html>`;
}
module.exports={escape,emailReady,reportBase,linkEmail,sendEmail,notifyOwner,reportDocument};
