'use strict';
const {ServiceError}=require('./lead-store.cjs');
async function readRequest(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(req.method!=='POST'){res.setHeader('Allow','POST');throw new ServiceError('Use the website form to make this request.',405);}
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new ServiceError('A JSON request is required.',415);
 if(req.headers['sec-fetch-site']==='cross-site')throw new ServiceError('Start this request from the Archwood website.',403);
 if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw Error();}catch{throw new ServiceError('Start this request from the Archwood website.',403);}}
 if(Number(req.headers['content-length']||0)>4096)throw new ServiceError('The request is too large.',413);
 try{
  let body=req.body;
  if(body===undefined){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)throw new ServiceError('The request is too large.',413);}body=JSON.parse(raw);}
  else if(typeof body==='string')body=JSON.parse(body);
  if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>4096)throw Error();
  return body;
 }catch(error){if(error instanceof ServiceError)throw error;throw new ServiceError('Check the form and try again.',400);}
}
function failure(res,error){res.statusCode=error.status||503;res.setHeader('Content-Type','application/json');if(res.statusCode===429)res.setHeader('Retry-After','600');res.end(JSON.stringify({error:error.status?error.message:'The service is temporarily unavailable. Please try again.'}));}
module.exports={readRequest,failure};
