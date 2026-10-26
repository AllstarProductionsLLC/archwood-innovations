'use strict';
const https = require('node:https');
const dns = require('node:dns').promises;
const { isIP, BlockList } = require('node:net');
const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]]) blocked.addSubnet(address, prefix, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
class ScanError extends Error {
  constructor(message, code = 'TARGET_UNAVAILABLE') { super(message); this.code = code; }
}
function isPublicIP(address) {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) return globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
  return false;
}
function validateUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new ScanError('Enter a valid public website address.', 'INVALID_URL'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.port || url.username || url.password || isIP(host) || host.includes(':') || !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)\.?$/.test(host) || host.endsWith('.')) {
    throw new ScanError('Use a public HTTPS website with a domain name and no custom port or login details.', 'INVALID_URL');
  }
  if (url.href.length > 2048) throw new ScanError('The website address is too long.', 'INVALID_URL');
  return url;
}
function normalizeTarget(input) {
  if (typeof input !== 'string' || input.length > 2048 || !input.trim()) throw new ScanError('Enter your website address.', 'INVALID_URL');
  let value = input.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  let parsed;
  try { parsed = new URL(value); } catch { throw new ScanError('Enter a valid website address.', 'INVALID_URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new ScanError('Use an HTTP or HTTPS website address.', 'INVALID_URL');
  // Always assess the HTTPS homepage, never a user-supplied action path or query.
  parsed.protocol = 'https:';
  validateUrl(parsed.href);
  return new URL(parsed.origin + '/');
}
async function resolvePublic(hostname, lookup = dns.lookup, signal) {
  let records;
  try {
    records = await new Promise((resolve, reject) => {
      const abort = () => reject(new ScanError('The review timed out.', 'TIMEOUT'));
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort, { once: true });
      Promise.resolve().then(() => lookup(hostname, { all: true, verbatim: true })).then(resolve, reject).finally(() => signal?.removeEventListener('abort', abort));
    });
  }
  catch (error) { if (error instanceof ScanError) throw error; throw new ScanError('The website’s public address could not be resolved. Check the domain and try again.', 'DNS_FAILED'); }
  if (!records.length || records.some(record => !isPublicIP(record.address))) throw new ScanError('This address does not resolve exclusively to public internet servers.', 'BLOCKED_TARGET');
  return records;
}
function pinnedLookup(records) {
  return (host, options, callback) => {
    const family = typeof options === 'number' ? options : options?.family;
    const available = family ? records.filter(record => record.family === family) : records;
    if (!available.length) return callback(new Error('No validated address available'));
    if (options?.all) callback(null, available);
    else callback(null, available[0].address, available[0].family);
  };
}
function requestPage(url, records, signal) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET', lookup: pinnedLookup(records), agent: false, signal,
      rejectUnauthorized: true, maxHeaderSize: 32768,
      headers: { 'User-Agent': 'ArchwoodSecurityReview/1.0 (+https://archwoodinnovations.com/website-security)', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' }
    }, res => {
      const result = { url: url.href, status: res.statusCode, headers: res.headers, body: '', truncated: false };
      // Redirects are validated and DNS-pinned again by the caller, never followed by the transport.
      if ([301,302,303,307,308].includes(res.statusCode)) { res.destroy(); resolve(result); return; }
      if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') {
        res.destroy(); reject(new ScanError('The server returned an unsupported compressed response. No grade was generated.')); return;
      }
      let size = 0; const chunks = [];
      res.on('data', chunk => {
        const remaining = 262144 - size;
        if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
        size += chunk.length;
        if (size > 262144) { result.truncated = true; result.body = Buffer.concat(chunks).toString('utf8'); resolve(result); res.destroy(); }
      });
      res.on('end', () => { result.body = Buffer.concat(chunks).toString('utf8'); resolve(result); });
      res.on('error', reject);
    });
    req.setTimeout(6500, () => req.destroy(new ScanError('The website took too long to respond. Try again later.', 'TIMEOUT')));
    req.on('error', reject);
    req.end();
  });
}
async function safeFetch(input, { signal, lookup, request = requestPage, sameOrigin } = {}) {
  let current = validateUrl(String(input));
  const redirectChain = [];
  for (let hop = 0; hop <= 3; hop += 1) {
    if (signal?.aborted) throw new ScanError('The review timed out. Try a quick review.', 'TIMEOUT');
    if (sameOrigin && current.origin !== sameOrigin) throw new ScanError('A linked page left the assessed website.', 'OUT_OF_SCOPE');
    const records = await resolvePublic(current.hostname, lookup, signal);
    const response = await request(current, records, signal);
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.location;
      if (!location) throw new ScanError('The website returned an incomplete redirect.');
      redirectChain.push(current.href);
      current = validateUrl(new URL(location, current).href);
      continue;
    }
    return { ...response, redirects: redirectChain };
  }
  throw new ScanError('The website redirects too many times. No grade was generated.', 'REDIRECT_LIMIT');
}
module.exports = { ScanError, isPublicIP, normalizeTarget, validateUrl, resolvePublic, pinnedLookup, safeFetch };
