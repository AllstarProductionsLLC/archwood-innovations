'use strict';
// Run locally. Opens no mailbox and sends no email; authorizes only future sending.
const http=require('node:http');
const crypto=require('node:crypto');
const fs=require('node:fs');
const {OAuth2Client}=require('google-auth-library');
const clientId=process.env.GMAIL_OAUTH_CLIENT_ID,secret=process.env.GMAIL_OAUTH_CLIENT_SECRET;
if(!clientId||!secret){console.error('Configure the Gmail OAuth client ID and secret in your local environment first.');process.exit(1);}
const redirect='http://127.0.0.1:53682/oauth2/callback';
const oauth=new OAuth2Client({clientId,clientSecret:secret,redirectUri:redirect});
const state=crypto.randomBytes(32).toString('hex');
const verifier=crypto.randomBytes(32).toString('base64url');
const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,redirect);
 if(url.pathname!=='/oauth2/callback'){res.writeHead(404);res.end();return;}
 const actual=url.searchParams.get('state')||'';
 if(Buffer.byteLength(actual)!==Buffer.byteLength(state)||!crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(state))){res.writeHead(400);res.end('Invalid authorization state.');return;}
 if(url.searchParams.has('error')){res.end('Authorization was not granted. You can close this tab.');server.close();return;}
 const code=url.searchParams.get('code');if(!code){res.writeHead(400);res.end('Missing authorization code.');return;}
 try{
  const{tokens}=await oauth.getToken({code,codeVerifier:verifier});
  if(!tokens.refresh_token)throw Error('No refresh token');
  if(tokens.scope&&!tokens.scope.split(' ').includes('https://www.googleapis.com/auth/gmail.send'))throw Error('Missing sending scope');
  const file='.env.local';let text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
  text=text.replace(/^GMAIL_OAUTH_REFRESH_TOKEN=.*\r?\n?/gm,'').replace(/\s*$/,'')+'\nGMAIL_OAUTH_REFRESH_TOKEN='+tokens.refresh_token+'\n';
  fs.writeFileSync(file,text,{mode:0o600});fs.chmodSync(file,0o600);
  res.setHeader('Content-Type','text/plain');res.end('Authorization saved locally. You can close this tab.');
  console.log('Refresh token saved locally. Add it securely to Vercel environment settings. No token is printed.');
 }catch{res.writeHead(500);res.end('Authorization could not be saved. Check the OAuth setup and try again.');console.error('Authorization could not be completed. No credentials were printed.');}
 server.close();
});
server.listen(53682,'127.0.0.1',()=>{
 console.log('Sign in as the dedicated report mailbox at this URL in your own browser:');
 console.log(oauth.generateAuthUrl({access_type:'offline',prompt:'consent',scope:['https://www.googleapis.com/auth/gmail.send'],state,code_challenge:challenge,code_challenge_method:'S256'}));
});
setTimeout(()=>server.close(),300000).unref();
