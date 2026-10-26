'use strict';
const {createHash}=require('node:crypto');
const {ServiceError}=require('./service-error.cjs');
const digest=value=>createHash('sha256').update(value).digest('hex');
function emailReady(env=process.env){if(!env.GMAIL_OAUTH_CLIENT_ID||!env.GMAIL_OAUTH_CLIENT_SECRET||!env.GMAIL_OAUTH_REFRESH_TOKEN||!env.GMAIL_SENDER_EMAIL||!env.REPORT_FROM_EMAIL)throw new ServiceError('Report emails are temporarily unavailable. You can still use the free quick check or contact our team.');}
function safeHeader(value){if(typeof value!=='string'||/[\r\n\0]/.test(value)||value.length>998)throw new ServiceError('Email sender configuration is invalid.');return value;}
function address(value){safeHeader(value);if(!/^(?:[^<>]*<)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(value))throw new ServiceError('Email address configuration is invalid.');return value;}
function encodeWords(value){const chunks=[];let current='';for(const char of value){if(Buffer.byteLength(current+char)>42){chunks.push(current);current='';}current+=char;}if(current)chunks.push(current);return chunks.map(chunk=>'=?UTF-8?B?'+Buffer.from(chunk).toString('base64')+'?=').join('\r\n ');}
function wrappedBase64(text){return Buffer.from(text||'','utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n')||'';}
function mime(payload,key,createdAt){
 const from=address(payload.from),to=payload.to.map(address),subject=safeHeader(payload.subject);
 const domain=from.match(/@([^>\s]+)>?$/)[1];const messageId=`<${digest(key)}@${domain}>`;const boundary='archwood_'+digest(key).slice(0,32);
 const headers=[`From: ${from}`,`To: ${to.join(', ')}`,`Subject: ${encodeWords(subject)}`,`Date: ${new Date(createdAt).toUTCString()}`,`Message-ID: ${messageId}`,'MIME-Version: 1.0',`Content-Type: multipart/alternative; boundary="${boundary}"`];
 if(payload.replyTo)headers.push(`Reply-To: ${address(payload.replyTo)}`);
 const parts=['text/plain','text/html'].map((type,index)=>`--${boundary}\r\nContent-Type: ${type}; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrappedBase64(index?payload.html||payload.text:payload.text)}`);
 return{raw:Buffer.from(headers.join('\r\n')+'\r\n\r\n'+parts.join('\r\n')+'\r\n--'+boundary+'--\r\n').toString('base64url'),messageId};
}
function oauthClient(env){const{OAuth2Client}=require('google-auth-library');const client=new OAuth2Client({clientId:env.GMAIL_OAUTH_CLIENT_ID,clientSecret:env.GMAIL_OAUTH_CLIENT_SECRET});client.setCredentials({refresh_token:env.GMAIL_OAUTH_REFRESH_TOKEN});return client;}
async function sendGoogleEmail(payload,key,{env=process.env,fetchImpl=fetch,db,authClient,now=()=>Date.now()}={}){
 emailReady(env);address(env.GMAIL_SENDER_EMAIL);payload={...payload,from:env.REPORT_FROM_EMAIL};
 const fromAddress=address(payload.from).match(/([^<>\s]+@[^<>\s]+)>?$/)[1];
 if(fromAddress.toLowerCase()!==env.GMAIL_SENDER_EMAIL.toLowerCase())throw new ServiceError('The report From address must match the authorized Gmail sender.');
 if(!db)db=require('./google-cloud.cjs').firestore(env);
 const ref=db.collection('security_mail').doc(digest(key)),payloadHash=digest(JSON.stringify(payload));
 const claim=await db.runTransaction(async tx=>{
  const snapshot=await tx.get(ref),prior=snapshot.data();
  if(snapshot.exists){if(prior.payload_hash!==payloadHash)throw new ServiceError('This email request is already recorded with different content.',409);if(prior.status==='accepted')return{sent:true,record:prior};throw new ServiceError('This email was already attempted. Check the sender mailbox and email log before retrying.',409);}
  const at=new Date(now()),built=mime(payload,key,at);
  const record={request_id:key,created_at:at,recipient:payload.to.join(', '),sender:payload.from,subject:payload.subject,message_id:built.messageId,status:'sending',payload_hash:payloadHash,purge_at:new Date(now()+90*86400000)};
  tx.create(ref,record);return{sent:false,record,built};
 });
 if(claim.sent)return claim.record.gmail_id;
 // Gmail has no send idempotency key. Never automatically retry an ambiguous send.
 let response,requestStarted=false;
 try{
  const access=await(authClient||oauthClient(env)).getAccessToken();const token=typeof access==='string'?access:access?.token;
  if(!token)throw Error('No access token');
  requestStarted=true;response=await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({raw:claim.built.raw}),signal:AbortSignal.timeout(10000)});
 }catch{await ref.update({status:requestStarted?'unknown':'auth_failed',updated_at:new Date(now())}).catch(()=>{});const error=new ServiceError(requestStarted?'We could not confirm email submission. Check your inbox before requesting another link.':'Google mailbox authorization needs attention. Please contact our team.');error.emailRejected=!requestStarted;throw error;}
 if(!response.ok){await ref.update({status:'rejected',updated_at:new Date(now()),http_status:response.status}).catch(()=>{});const error=new ServiceError('Google did not accept the email request. Please try again later.');error.emailRejected=true;throw error;}
 let result;try{result=await response.json();}catch{result=null;}
 if(!result?.id){await ref.update({status:'unknown',updated_at:new Date(now())}).catch(()=>{});throw new ServiceError('We could not confirm email submission. Check your inbox before retrying.');}
 await ref.update({status:'accepted',gmail_id:result.id,gmail_thread_id:result.threadId||null,accepted_at:new Date(now()),updated_at:new Date(now())}).catch(()=>{});
 return result.id;
}
module.exports={emailReady,sendGoogleEmail,mime,safeHeader,address};
