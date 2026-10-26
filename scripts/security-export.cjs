'use strict';
// Owner-only CLI, authenticated with ADC/WIF. It is not a public website endpoint.
const {createStore,plain}=require('../lib/lead-store.cjs');
function csv(value){let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return'"'+text.replace(/"/g,'""')+'"';}
async function main(){
 const store=createStore();const limit=Math.min(10000,Math.max(1,Number(process.env.SECURITY_EXPORT_LIMIT)||1000));
 const rows=await store.db.collection('security_report_access').orderBy('created_at','desc').limit(limit).get();
 const columns=['requested_at','website','email','wants_help','report_opened_at','email_status','gmail_message_id','owner_notification_status','expansion_status'];
 console.log(columns.map(csv).join(','));
 for(const snapshot of rows.docs){const row=plain(snapshot.data()),[lead,scan]=await Promise.all([store.getLead(row.lead_id),store.getScan(row.scan_id).catch(()=>null)]);const values=[row.created_at,scan?.website_url,lead?.email,row.wants_help,row.verified_at,row.email_status,row.provider_id,row.notification_status,row.expansion_status];console.log(values.map(csv).join(','));}
}
if(require.main===module)main().catch(()=>{console.error('Export failed. Check Google Cloud authentication and database permissions.');process.exitCode=1;});
module.exports={csv};
