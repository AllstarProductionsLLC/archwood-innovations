'use strict';
const CAVEAT = 'Initial public checks only. Findings can be incomplete or misread. A positive result does not rule out vulnerabilities, and a risk signal does not confirm exploitability. Our team can help verify the results in a deeper, authorized review.';
function summarize(report) {
 const controls=new Map();
 for(const check of report.checks) {
  const existing=controls.get(check.id);
  if(!existing || check.status==='gap') controls.set(check.id,check);
 }
 const gaps=[...controls.values()].filter(check=>check.status==='gap');
 const potential=report.php.state==='potential';
 const otherRisks=report.observations.filter(item=>['gap','potential'].includes(item.status));
 const tone=potential?'priority':gaps.length===0&&otherRisks.length===0?'positive':gaps.length<=2&&otherRisks.length===0?'balanced':'attention';
 const content={
  positive:{label:'A strong start',title:'Good work. Your public protections look encouraging.',body:'The basic protections we checked were observed on these pages. Keep that foundation strong, and consider a deeper review for risks these checks cannot see.',cta:'Plan your next security review'},
  balanced:{label:'A few things to review',title:'A useful foundation, with room to strengthen it.',body:'Some basic protections were observed. A few configuration items deserve a closer look with your team or hosting provider.',cta:'Talk through the next steps'},
  attention:{label:'Attention recommended',title:'Several public protections need a closer look.',body:'Our initial checks flagged configuration gaps or possible risk signals. These deserve review, but do not establish that the website is compromised or exploitable.',cta:'Get help prioritizing these findings'},
  priority:{label:'Priority verification recommended',title:'A potential critical PHP exposure needs prompt verification.',body:'The server advertises a PHP version associated with critical advisories. Banners can be inaccurate or vendor-patched. Ask your host or security team to verify the actual runtime and patch status promptly.',cta:'Request a priority security review'}
 }[tone];
 return {tone,...content,target:report.target,finalUrl:report.finalUrl,generatedAt:report.generatedAt,mode:report.mode,observed:controls.size-gaps.length,total:controls.size,gaps:gaps.length,pages:report.coverage.pagesReviewed,
  highlights:gaps.slice(0,3).map(item=>item.title),phpStatus:report.php.state,
  priorityAdvisories:potential?report.php.advisories.filter(item=>item.status==='potential').map(item=>item.id):[],
  caveat:CAVEAT};
}
module.exports={summarize,CAVEAT};
