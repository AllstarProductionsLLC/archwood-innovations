(function(){
 'use strict';
 const $=selector=>document.querySelector(selector);
 const form=$('#review-form'),submit=$('#review-submit'),error=$('#form-error'),results=$('#review-results');
 const progressPanel=$('#review-progress'),progress=$('#scan-progress'),status=$('#progress-status'),consoleState=$('#console-state'),consolePanel=$('#security-console');
 const motionButton=$('#animation-toggle'),reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 let paused=false,controller=null,scanReceipt=null,reportToken=null,report=null;
 const designPreview=document.body.dataset.designPreview==='true';
 function syncMotion(){consolePanel.classList.toggle('animation-paused',paused||reduced.matches);motionButton.hidden=reduced.matches;motionButton.setAttribute('aria-pressed',String(paused));motionButton.textContent=paused?'Enable animation':'Pause animation';}
 motionButton.addEventListener('click',()=>{paused=!paused;syncMotion();});reduced.addEventListener('change',syncMotion);syncMotion();submit.disabled=false;
 function node(tag,text,className){const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;}
 function moveToResults(){results.hidden=false;results.focus({preventScroll:true});results.scrollIntoView({behavior:paused||reduced.matches?'instant':'smooth',block:'start'});}
 function renderSnapshot(summary,move=true){
  const host=new URL(summary.finalUrl).hostname;
  $('#report-target').textContent=`${host} · ${new Date(summary.generatedAt).toLocaleString()} · ${summary.mode==='expanded'?'Expanded review':'Quick check'}`;
  $('#results-title').textContent=summary.tone==='positive'?'An encouraging first look.':summary.tone==='priority'?'A priority worth verifying.':'Useful signals. Clear next steps.';
  const snapshot=$('#snapshot');snapshot.dataset.tone=summary.tone;
  $('#snapshot-label').textContent=summary.label;$('#snapshot-title').textContent=summary.title;$('#snapshot-body').textContent=summary.body;
  $('#snapshot-observed').textContent=`${summary.observed} of ${summary.total}`;$('#snapshot-gaps').textContent=String(summary.gaps);$('#snapshot-pages').textContent=String(summary.pages);
  $('#snapshot-highlights').replaceChildren(...summary.highlights.map(title=>node('li',title)));
  $('#snapshot-highlights').hidden=!summary.highlights.length;
  $('#priority-note').hidden=!summary.priorityAdvisories.length;
  $('#priority-note').textContent=summary.priorityAdvisories.length?`Potential version match: ${summary.priorityAdvisories.join(', ')}. Actual patch status and exposure require verification.`:'';
  const contact=$('#snapshot-contact');contact.replaceChildren(document.createTextNode('Email us about these findings '),node('span','↗'));contact.lastChild.setAttribute('aria-hidden','true');
  contact.href=`mailto:info@archwoodinnovations.com?subject=${encodeURIComponent('Website security review: '+host)}&body=${encodeURIComponent('Hello Archwood,\n\nI would like help reviewing the initial public security findings for '+summary.finalUrl+'\n\nSummary: '+summary.label+'\n')}`;
  $('#snapshot-caveat').textContent=summary.caveat;
  if(move)moveToResults();else results.hidden=false;
 }
 function sourceLink(url){const link=node('a','Read the vendor advisory ↗');link.href=url;link.target='_blank';link.rel='noopener noreferrer';return link;}
 const phpLabels={unknown:'Needs verification',potential:'Potential exposure','no-version-match':'No version match'};
 function renderFull(data,expanded=false){
  report=data;$('#report-unlock').hidden=true;$('#full-report').hidden=false;
  $('#expand-review').disabled=expanded;$('#expand-review').textContent=expanded?'Expanded review completed':'Run expanded review';
  $('#php-status').textContent=phpLabels[data.php.state];$('#php-summary').textContent=data.php.summary;$('#php-baselines').textContent=data.php.fixes;
  const advisories=$('#php-advisories');advisories.replaceChildren();
  for(const advisory of [...data.php.advisories,data.php.configurationAdvisory]){const item=node('article');item.append(node('h4',advisory.id),node('span',phpLabels[advisory.status],'finding-badge'),node('p',advisory.explanation),sourceLink(advisory.url));advisories.append(item);}
  const list=$('#finding-list');list.replaceChildren();
  const entries=[...data.checks,...data.observations].sort((a,b)=>Number(a.status==='observed')-Number(b.status==='observed'));
  for(const finding of entries){
   const item=node('details',undefined,'finding finding-disclosure');item.dataset.status=finding.status;
   const heading=node('summary');const meta=node('span',undefined,'finding-meta');meta.append(node('span',finding.status==='gap'?'Configuration item':finding.status==='potential'?'Possible risk':'Observed','finding-badge'));
   heading.append(meta,node('span',finding.title,'finding-title'),node('span','+','finding-expand'));
   item.append(heading,node('p',finding.detail),node('p',finding.confidence,'finding-confidence'),node('p',finding.evidence,'finding-evidence'),node('p',finding.url,'finding-url'));list.append(item);
  }
  $('#report-coverage').replaceChildren(...data.limitations.map(text=>node('li',text)));
  const pages=$('#report-page-list');pages.replaceChildren();
  for(const page of data.pages)pages.append(node('p',`Reviewed: ${page.url}${page.truncated?' · HTML limited to 256 KiB':''}`,'coverage-page'));
  for(const page of data.skipped)pages.append(node('p',`Not reviewed: ${page.url} · ${page.reason}`,'coverage-page'));
  if(data.mode==='expanded'&&data.pages.length<3)pages.append(node('p','Only eligible, reachable informational links found on the homepage were reviewed. Up to three pages are included.','coverage-page'));
  setFilter('all');
 }
 function setFilter(filter){document.querySelectorAll('[data-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===filter)));let visible=0;document.querySelectorAll('.finding').forEach(item=>{item.hidden=filter==='attention'?item.dataset.status==='observed':filter==='observed'?item.dataset.status!=='observed':false;if(!item.hidden)visible++;});$('#no-findings').hidden=visible>0;}
 document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>setFilter(button.dataset.filter)));
 function setStage(stage,message){progress.value=stage;status.textContent=message;consoleState.textContent=message;document.querySelectorAll('#review-stages li').forEach((item,index)=>{item.classList.toggle('is-active',index===stage);item.classList.toggle('is-complete',index<stage);});}
 function busy(value){form.setAttribute('aria-busy',String(value));for(const field of form.elements)field.disabled=value;consolePanel.classList.toggle('is-reviewing',value);$('#expand-review').disabled=value||report?.mode==='expanded';}
 $('#cancel-review').addEventListener('click',()=>controller?.abort());
 async function runScan(mode){
  if(controller)return;
  error.hidden=true;$('#report-action-error').hidden=true;progressPanel.hidden=false;setStage(0,'Preparing your review');
  const payload=mode==='quick'?{url:$('#website-url').value,mode,authorized:$('#authorized').checked}:{mode,authorized:true,reportToken};
  if(mode==='quick'){results.hidden=true;scanReceipt=null;reportToken=null;report=null;$('#full-report').hidden=true;$('#report-unlock').hidden=false;$('#email-status').textContent='';$('#email-error').hidden=true;$('#email-submit').disabled=false;}
  else $('#assessment-panel').scrollIntoView({behavior:'instant',block:'start'});
  busy(true);controller=new AbortController();let completed=false,timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller?.abort();},55000);
  try{
   const response=await fetch('/api/security-scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal,cache:'no-store'});
   if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||'The review is unavailable right now.');}
   if(!response.headers.get('content-type')?.includes('application/x-ndjson')||!response.body)throw new Error('The review service is unavailable right now.');
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
   function handle(line){if(!line.trim())return;const event=JSON.parse(line);if(event.type==='error')throw new Error(event.message);if(event.type==='result'){completed=true;setStage(6,'Review complete');if(mode==='quick')scanReceipt={scanId:event.scanId,scanToken:event.scanToken};renderSnapshot(event.summary);if(event.report)renderFull(event.report,true);}else if(Number.isInteger(event.stage))setStage(event.stage,event.message);}
   while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)handle(line);if(buffer.length>200000)throw new Error('The report could not be read.');if(done){if(buffer)handle(buffer);break;}}
   if(!completed)throw new Error('The review ended before a result was ready. Please try again.');
  }catch(failure){controller.abort();const target=mode==='quick'?error:$('#report-action-error');target.textContent=failure.name==='AbortError'?(timedOut?'The review took too long. Please try again later.':'Review canceled. Your previous report is unchanged.'):failure.message;target.hidden=false;consoleState.textContent='Review stopped';if(mode==='expanded')moveToResults();}
  finally{clearTimeout(timer);controller=null;busy(false);progressPanel.hidden=true;}
 }
 form.addEventListener('submit',event=>{event.preventDefault();if(!designPreview&&form.reportValidity())runScan('quick');});
 async function reportRequest(payload,{download=false}={}){
  const response=await fetch('/api/security-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'The report service is unavailable right now.');}
  return download?response.blob():response.json();
 }
 $('#report-email-form').addEventListener('submit',async event=>{
  event.preventDefault();if(designPreview){$('#email-status').textContent='Illustrative layout only. No email is collected or sent in this design preview.';return;}if(!scanReceipt||!event.currentTarget.reportValidity())return;
  const button=$('#email-submit');button.disabled=true;$('#email-error').hidden=true;$('#email-status').textContent='Submitting your report email request…';
  try{const data=await reportRequest({action:'request',...scanReceipt,email:$('#report-email').value,wantsHelp:$('#wants-help').checked,fax:$('#report-fax').value});$('#email-status').textContent=data.message;}
  catch(failure){$('#email-error').textContent=failure.message;$('#email-error').hidden=false;$('#email-status').textContent='';button.disabled=false;}
 });
 $('#report-email').addEventListener('input',()=>{$('#email-submit').disabled=false;});
 $('#expand-review').addEventListener('click',()=>{if(reportToken)runScan('expanded');});
 $('#download-report').addEventListener('click',async()=>{
  const button=$('#download-report');button.disabled=true;$('#report-action-error').hidden=true;
  try{const blob=await reportRequest({action:'download',reportToken},{download:true});const url=URL.createObjectURL(blob),link=node('a');link.href=url;link.download='archwood-website-security-report.html';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  catch(failure){$('#report-action-error').textContent=failure.message;$('#report-action-error').hidden=false;}
  finally{button.disabled=false;}
 });
 async function openLink(){
  const raw=new URLSearchParams(location.hash.slice(1)).get('report');if(!raw)return;
  // Keep private link credentials out of the address bar and future browser referrers.
  history.replaceState(null,'',location.pathname+location.search);
  const robots=document.createElement('meta');robots.name='robots';robots.content='noindex,nofollow';document.head.append(robots);
  error.hidden=true;consoleState.textContent='Opening your private report';
  try{const data=await reportRequest({action:'open',reportToken:raw});reportToken=raw;renderSnapshot(data.summary,false);renderFull(data.report,data.expanded);consoleState.textContent='Your report is unlocked';
   requestAnimationFrame(()=>{results.focus({preventScroll:true});$('.results-heading').scrollIntoView({behavior:'instant',block:'start'});});}
  catch(failure){error.textContent=failure.message;error.hidden=false;consoleState.textContent='Report unavailable';}
 }
 if(designPreview){
  const base={target:'https://example.com/',finalUrl:'https://example.com/',generatedAt:new Date().toISOString(),mode:'quick',observed:6,total:6,gaps:0,pages:1,highlights:[],priorityAdvisories:[],caveat:'Illustrative example, not a scan. Initial public checks can miss risks or flag items that do not apply. A deeper, authorized review can help verify the findings.'};
  const examples={
   positive:{tone:'positive',label:'A strong start',title:'Good work. Your public protections look encouraging.',body:'The basic protections in this example were observed. Keep that foundation strong, and consider a deeper review for risks these checks cannot see.',cta:'Plan your next security review'},
   balanced:{tone:'balanced',label:'A few things to review',title:'A useful foundation, with room to strengthen it.',body:'Some basic protections were observed. A few configuration items deserve a closer look with your team or hosting provider.',cta:'Talk through the next steps',observed:4,gaps:2,highlights:['HTTPS enforcement header','Referrer privacy policy']},
   attention:{tone:'attention',label:'Attention recommended',title:'Several public protections need a closer look.',body:'These illustrative configuration gaps deserve review. They do not establish that the website is compromised or exploitable.',cta:'Get help prioritizing these findings',observed:2,gaps:4,highlights:['Content Security Policy header','HTTPS enforcement header','Page framing protection']},
   priority:{tone:'priority',label:'Priority verification recommended',title:'A potential critical PHP exposure needs prompt verification.',body:'This example illustrates an advertised PHP version associated with critical advisories. Banners can be inaccurate or vendor-patched. The actual runtime and patch status need prompt verification.',cta:'Request a priority security review',observed:3,gaps:3,priorityAdvisories:['CVE-2026-109618','CVE-2026-109619']}
  };
  document.querySelectorAll('[data-preview-tone]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-preview-tone]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));renderSnapshot({...base,...examples[button.dataset.previewTone]},false);}));
  renderSnapshot({...base,...examples.positive},false);
 }else openLink();
})();
