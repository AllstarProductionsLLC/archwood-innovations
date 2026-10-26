'use strict';
const {timingSafeEqual}=require('node:crypto');
const {createStore}=require('../lib/lead-store.cjs');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');
 const expected='Bearer '+(process.env.CRON_SECRET||'');const actual=req.headers.authorization||'';
 if(req.method!=='GET'||!process.env.CRON_SECRET||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected))){res.statusCode=401;res.end('Unauthorized');return;}
 try{await createStore().rpc('security_cleanup',{});res.setHeader('Content-Type','application/json');res.end('{"ok":true}');}
 catch{res.statusCode=503;res.end('Cleanup unavailable');}
};
