'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const handler = require('../api/security-scan.js');
const config = require('../vercel.json');
const root = path.resolve(__dirname,'../dist');
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.webp':'image/webp', '.woff':'font/woff' };
http.createServer(async (req,res) => {
  for (const header of config.headers[0].headers) res.setHeader(header.key,header.value);
  const pathname = new URL(req.url,'http://localhost').pathname;
  if (pathname === '/api/security-scan') return handler(req,res);
  const redirect = config.redirects.find(item => item.source === pathname);
  if (redirect) { res.writeHead(307,{ Location:redirect.destination });res.end();return; }
  let file = path.resolve(root,'.'+decodeURIComponent(pathname));
  if (file !== root && !file.startsWith(root+path.sep)) { res.writeHead(403);res.end();return; }
  if (file === root) file = path.join(root,'index.html');
  else if (!path.extname(file)) file += '.html';
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404);res.end('Not found');return; }
  res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(Number(process.env.PORT || 3000),'0.0.0.0',() => console.log('Archwood preview: http://localhost:'+(process.env.PORT || 3000)));
