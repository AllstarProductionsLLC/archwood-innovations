'use strict';
const { normalizeTarget, safeFetch, ScanError } = require('./safe-request.cjs');
const REVIEWED = '2026-10-25';
const PHP_SOURCE = 'https://www.php.net/archive/2026.php';
const fixes = { '8.2': 35, '8.3': 36, '8.4': 27, '8.5': 12 };
const advisorySources = [
  { id: 'CVE-2026-109618', title: 'PHP memory handling advisory', url: 'https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w' },
  { id: 'CVE-2026-109619', title: 'PHP request-state advisory', url: 'https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp' }
];
function phpReview(pages) {
  const banners = pages.flatMap(page => [page.headers['x-powered-by'] || '', page.headers.server || '']);
  const versions = [...new Set(banners.flatMap(banner => [...banner.matchAll(/\bPHP\/(\d+\.\d+\.\d+)([^\s;,)]*)/gi)].map(match => match[1] + match[2])))];
  const detected = banners.some(value => /\bPHP\b/i.test(value));
  const inferred = pages.some(page => /wp-content\/|<meta[^>]+content=["']WordPress\b/i.test(page.body));
  let state = 'unknown', version = versions.length === 1 ? versions[0] : null;
  if (version && /^\d+\.\d+\.\d+$/.test(version)) {
    const [major, minor, patch] = version.split('.').map(Number);
    const branch = `${major}.${minor}`;
    if (fixes[branch] !== undefined) state = patch < fixes[branch] ? 'potential' : 'no-version-match';
    else if ((major === 5 && minor >= 4) || major === 7 || (major === 8 && minor < 2)) state = 'potential';
  }
  const summary = versions.length > 1 ? 'Conflicting PHP version banners were observed. Verify the runtime with your host.'
    : version ? `The server advertises PHP/${version}. Banners can be stale, altered, or backed by vendor patches.`
    : detected ? 'A PHP banner is present, but a full runtime version is not exposed.'
    : inferred ? 'WordPress markup suggests PHP may be used. It does not reveal the PHP runtime or patch status.'
    : 'No PHP version was disclosed. PHP use and patch status remain unknown.';
  return {
    version, state, summary, confidence: state === 'potential' ? 'Medium: version-based indication, not an exploit test' : 'Runtime verification required',
    advisories: advisorySources.map(advisory => ({ ...advisory, status: state, explanation: state === 'potential'
      ? 'The advertised version falls within a known affected range. Actual exposure and vendor backports need verification.'
      : state === 'no-version-match' ? 'The advertised version is at or above the published fix for this advisory. This does not establish overall security.'
      : 'Public information is insufficient to determine whether this advisory applies.' })),
    configurationAdvisory: { id: 'CVE-2026-115560', status: 'unknown', url: PHP_SOURCE, explanation: 'PHP published a further session-configuration advisory on October 23. Applicability depends on internal settings and application behavior that a public review cannot see.' },
    reviewed: REVIEWED, fixes: 'Published fixes for the October 21 pair: PHP 8.2.35, 8.3.36, 8.4.27, and 8.5.12. These are advisory-specific baselines, not a claim to be the latest releases.',
    source: PHP_SOURCE
  };
}
function checkPage(page) {
  const h = page.headers;
  const csp = h['content-security-policy'] || '';
  const hsts = /(?:^|;)\s*max-age\s*=\s*(\d+)/i.exec(h['strict-transport-security'] || '');
  const sourcePolicy = /(?:^|;)\s*script-src\s+([^;]+)/i.exec(csp)?.[1] || /(?:^|;)\s*default-src\s+([^;]+)/i.exec(csp)?.[1] || '';
  const ancestors = /(?:^|;)\s*frame-ancestors\s+([^;]+)/i.exec(csp)?.[1];
  const frameProtected = ancestors !== undefined ? /^(?:'none'|'self')$/.test(ancestors.trim()) : /^(?:DENY|SAMEORIGIN)$/i.test((h['x-frame-options'] || '').trim());
  const basicCsp = Boolean(sourcePolicy) && !/(?:^|\s)(?:\*|https?:|data:|blob:|'unsafe-inline'|'unsafe-eval')(?:\s|$)/i.test(sourcePolicy);
  const checks = [
    ['https', 'Validated HTTPS connection', true, 20, 'The HTTPS request completed with certificate verification enabled.'],
    ['hsts', 'HTTPS enforcement header', Boolean(hsts && Number(hsts[1]) > 0), 20, h['strict-transport-security'] ? `Strict-Transport-Security: ${h['strict-transport-security']}` : 'No Strict-Transport-Security response header observed.'],
    ['csp', 'Content Security Policy header', basicCsp, 20, csp ? `Content-Security-Policy: ${csp}` : 'No enforced Content-Security-Policy response header observed. Meta policies and report-only policies are not graded.'],
    ['framing', 'Page framing protection', frameProtected, 15, `X-Frame-Options: ${h['x-frame-options'] || 'not observed'}. CSP frame-ancestors: ${/(?:^|;)\s*frame-ancestors\s+([^;]+)/i.exec(csp)?.[1] || 'not observed'}.`],
    ['mime', 'Content type protection', /^nosniff$/i.test((h['x-content-type-options'] || '').trim()), 15, `X-Content-Type-Options: ${h['x-content-type-options'] || 'not observed'}.`],
    ['referrer', 'Referrer privacy policy', /^(?:no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin|origin)$/i.test((h['referrer-policy'] || '').trim().split(',').pop().trim()), 10, `Referrer-Policy: ${h['referrer-policy'] || 'not observed'}.`]
  ];
  return checks.map(([id, title, passed, weight, evidence]) => ({ id, title, status: passed ? 'observed' : 'gap', severity: passed ? 'info' : ['hsts','csp'].includes(id) ? 'medium' : 'low', confidence: 'High: directly observed response', weight, evidence: evidence.slice(0,1200), url: page.url, detail: passed ? 'The basic response check passed. Policy completeness and application behavior are outside this check.' : 'This browser protection was absent or did not meet the basic check on this response. This is a configuration gap, not proof of an exploitable vulnerability.' }));
}
function observations(pages) {
  const findings = [];
  for (const page of pages) {
    const resources = [...page.body.matchAll(/<(?:script|img|iframe|source|audio|video|link)\b[^>]*\b(?:src|href)\s*=\s*["'](http:\/\/[^"']+)["']/gi)];
    if (resources.length) findings.push({ title: 'HTTP resource references in HTTPS markup', severity: 'medium', confidence: 'Medium: markup indication', status: 'potential', url: page.url, evidence: `${resources.length} HTTP resource reference(s) observed in returned HTML.`, detail: 'Browser upgrades, blocking, CSP, and resource type affect actual impact. The page was not executed in a browser.' });
    const cookies = page.headers['set-cookie'] || [];
    const list = Array.isArray(cookies) ? cookies : [cookies];
    const missingSecure = list.filter(value => !/;\s*Secure(?:;|$)/i.test(value));
    if (missingSecure.length) findings.push({ title: 'Cookies without an explicit Secure flag', severity: 'low', confidence: 'High: returned cookie attributes', status: 'gap', url: page.url, evidence: `${missingSecure.length} returned cookie(s) did not declare Secure. Cookie values are not retained in this report.`, detail: 'Cookie purpose and application context require review. This does not establish a session vulnerability.' });
    if (page.headers['x-powered-by']) findings.push({ title: 'Technology information is publicly disclosed', severity: 'info', confidence: 'High: returned header', status: 'observed', url: page.url, evidence: `X-Powered-By: ${String(page.headers['x-powered-by']).slice(0,200)}`, detail: 'A technology banner is an observation, not a vulnerability by itself.' });
  }
  return findings;
}
function linkedPages(page) {
  const origin = new URL(page.url).origin;
  const urls = new Set();
  for (const match of page.body.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1], page.url);
      // Only ordinary first-level informational pages, never action-like or parameterized URLs.
      if (url.origin !== origin || url.search || url.hash || !/^\/(?:about|about-us|contact|contact-us|privacy|privacy-policy|services|company|security)\/?$/i.test(url.pathname) || url.href === page.url) continue;
      urls.add(url.href);
    } catch { /* Ignore malformed links. */ }
  }
  return [...urls].slice(0, 2);
}
async function runReview(input, mode, { fetchPage = safeFetch, emit = () => {}, signal } = {}) {
  emit({ stage: 0, message: 'Validating public website address' });
  const target = normalizeTarget(input);
  emit({ stage: 1, message: 'Connecting over HTTPS and reading the public homepage' });
  const homepage = await fetchPage(target.href, { signal });
  if (homepage.status < 200 || homepage.status >= 300 || !/text\/html|application\/xhtml\+xml/i.test(homepage.headers['content-type'] || '')) throw new ScanError('The website did not return a successful HTML page. It may require sign-in, block automated requests, or be unavailable. No grade was generated.', 'UNASSESSABLE');
  if (/<title[^>]*>\s*(?:just a moment|access denied|verify you are human|sign in|log in)(?:[.\s<|–-])/i.test(homepage.body)) throw new ScanError('The website returned an access or sign-in screen. Its normal public page could not be assessed. No grade was generated.', 'UNASSESSABLE');
  const pages = [homepage]; const skipped = [];
  emit({ stage: 2, message: mode === 'expanded' ? 'Reviewing up to two public informational pages' : 'Collecting homepage response evidence' });
  if (mode === 'expanded') {
    for (const url of linkedPages(homepage)) {
      try {
        const page = await fetchPage(url, { signal, sameOrigin: new URL(homepage.url).origin });
        if (page.status >= 200 && page.status < 300 && /text\/html|application\/xhtml\+xml/i.test(page.headers['content-type'] || '')) pages.push(page);
        else skipped.push({ url, reason: 'No successful HTML response' });
      } catch { skipped.push({ url, reason: 'Page could not be assessed within scope or time limits' }); }
    }
  }
  emit({ stage: 3, message: 'Evaluating browser protection headers and public markup' });
  const allChecks = pages.flatMap(checkPage);
  // Use the weakest observed value per control, rather than averaging away a gap.
  const gradeChecks = checkPage(homepage).map(check => ({ ...check, status: allChecks.filter(other => other.id === check.id).every(other => other.status === 'observed') ? 'observed' : 'gap' }));
  const score = gradeChecks.reduce((total, check) => total + (check.status === 'observed' ? check.weight : 0), 0);
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F';
  emit({ stage: 4, message: 'Comparing disclosed PHP versions with selected vendor advisories' });
  const php = phpReview(pages);
  emit({ stage: 5, message: 'Preparing your evidence and coverage report' });
  return {
    target: target.href, finalUrl: homepage.url, mode, generatedAt: new Date().toISOString(), score, grade,
    gradeLabel: 'Public configuration grade', checks: allChecks, observations: observations(pages), php,
    pages: pages.map(page => ({ url: page.url, status: page.status, truncated: page.truncated, redirects: page.redirects || [] })), skipped,
    coverage: { pagesReviewed: pages.length, maxPages: mode === 'expanded' ? 3 : 1, advisoryReviewed: REVIEWED, checksGraded: gradeChecks.length },
    limitations: [
      'This review measures six basic HTTPS and response-header controls on the pages reached. It is not an overall security rating or a certification.',
      'This is a passive public review, not a penetration test. It does not test exploitation, authenticated areas, server files, internal configuration, databases, or every dependency.',
      'PHP advisory matches use advertised versions, which may be hidden, inaccurate, or vendor-patched. Actual exploitability and patch status require runtime verification.',
      `The selected PHP advisory rules were reviewed on ${REVIEWED}. They are not a live or comprehensive vulnerability feed.`,
      'Only returned HTML is inspected, up to 256 KiB per page. JavaScript is not executed. Other pages and controls may differ.'
    ]
  };
}
module.exports = { runReview, checkPage, phpReview, linkedPages, observations, REVIEWED };
