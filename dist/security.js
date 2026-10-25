(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const form = $('#review-form');
  const submit = $('#review-submit');
  const error = $('#form-error');
  const results = $('#review-results');
  const progressPanel = $('#review-progress');
  const progress = $('#scan-progress');
  const status = $('#progress-status');
  const consoleState = $('#console-state');
  const consolePanel = $('#security-console');
  const motionButton = $('#animation-toggle');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false, controller = null, report = null;
  function syncMotion() {
    consolePanel.classList.toggle('animation-paused', paused || reduced.matches);
    motionButton.hidden = reduced.matches;
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.textContent = paused ? 'Enable animation' : 'Pause animation';
  }
  motionButton.addEventListener('click', () => { paused = !paused; syncMotion(); });
  reduced.addEventListener('change', syncMotion);
  syncMotion();
  submit.disabled = false;
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function sourceLink(url) {
    const link = node('a', 'Read the vendor advisory ↗');
    link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    return link;
  }
  const phpLabels = { unknown: 'Needs verification', potential: 'Potential exposure', 'no-version-match': 'No version match' };
  function renderReport(data) {
    report = data;
    $('#report-target').textContent = `${new URL(data.finalUrl).hostname} · ${new Date(data.generatedAt).toLocaleString()} · ${data.mode === 'expanded' ? 'Expanded review' : 'Quick review'}`;
    $('#report-grade').textContent = data.grade;
    $('#grade-ring').style.setProperty('--score', data.score);
    $('#report-score').textContent = `${data.score}/100 on observed configuration controls`;
    $('#report-pages').textContent = `${data.coverage.pagesReviewed}/${data.coverage.maxPages}`;
    const uniqueGaps = new Set(data.checks.filter(check => check.status === 'gap').map(check => check.id));
    $('#report-gaps').textContent = String(uniqueGaps.size);
    $('#report-php').textContent = data.php.version || 'Not disclosed';
    $('#php-status').textContent = phpLabels[data.php.state];
    $('#php-summary').textContent = data.php.summary;
    $('#php-baselines').textContent = data.php.fixes;
    const advisories = $('#php-advisories'); advisories.replaceChildren();
    for (const advisory of [...data.php.advisories, data.php.configurationAdvisory]) {
      const item = node('article');
      item.append(node('h4', advisory.id), node('span', phpLabels[advisory.status], 'finding-badge'), node('p', advisory.explanation), sourceLink(advisory.url));
      if (advisory.status === 'potential') item.append(node('p', data.php.confidence));
      advisories.append(item);
    }
    const findings = $('#finding-list'); findings.replaceChildren();
    const entries = [...data.checks, ...data.observations].sort((a,b) => Number(a.status === 'observed') - Number(b.status === 'observed'));
    for (const finding of entries) {
      const article = node('article', undefined, 'finding'); article.dataset.status = finding.status;
      const meta = node('div', undefined, 'finding-meta');
      meta.append(node('span', finding.status === 'gap' ? 'Configuration gap' : finding.status === 'potential' ? 'Possible risk' : 'Observed', 'finding-badge'), node('span', finding.severity, 'finding-badge'));
      const evidence = node('details');
      evidence.append(node('summary', 'View evidence'), node('p', finding.evidence, 'finding-evidence'), node('p', finding.url, 'finding-url'));
      article.append(meta, node('h4', finding.title), node('p', finding.detail), node('p', finding.confidence, 'finding-confidence'), evidence);
      findings.append(article);
    }
    const coverage = $('#report-coverage'); coverage.replaceChildren(...data.limitations.map(text => node('li',text)));
    const pages = $('#report-page-list'); pages.replaceChildren();
    for (const page of data.pages) pages.append(node('p', `Reviewed: ${page.url}${page.truncated ? ' · HTML limited to the first 256 KiB' : ''}${page.redirects.length ? ` · ${page.redirects.length} redirect(s) followed` : ''}`, 'coverage-page'));
    for (const page of data.skipped) pages.append(node('p', `Not reviewed: ${page.url} · ${page.reason}`, 'coverage-page'));
    if (data.mode === 'expanded' && data.pages.length < 3) pages.append(node('p','Expanded coverage includes only eligible informational links found on the homepage. Fewer than three pages were available or reachable.','coverage-page'));
    $('#report-contact').href = `mailto:info@archwoodinnovations.com?subject=${encodeURIComponent('Website security review: ' + new URL(data.finalUrl).hostname)}`;
    setFilter('all');
    results.hidden = false;
    results.focus({ preventScroll: true });
    results.scrollIntoView({ behavior: paused || reduced.matches ? 'instant' : 'smooth', block: 'start' });
  }
  function setFilter(filter) {
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.filter === filter)));
    let visible = 0;
    document.querySelectorAll('.finding').forEach(finding => {
      finding.hidden = filter === 'attention' ? finding.dataset.status === 'observed' : filter === 'observed' ? finding.dataset.status !== 'observed' : false;
      if (!finding.hidden) visible += 1;
    });
    $('#no-findings').hidden = visible > 0;
  }
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => setFilter(button.dataset.filter)));
  function setStage(stage, message) {
    progress.value = stage;
    status.textContent = message;
    consoleState.textContent = message;
    document.querySelectorAll('#review-stages li').forEach((item, index) => {
      item.classList.toggle('is-active', index === stage);
      item.classList.toggle('is-complete', index < stage);
    });
  }
  function busy(value) {
    form.setAttribute('aria-busy',String(value));
    for (const field of form.elements) field.disabled = value;
    consolePanel.classList.toggle('is-reviewing', value);
  }
  $('#cancel-review').addEventListener('click', () => controller?.abort());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (controller || !form.reportValidity()) return;
    error.hidden = true; results.hidden = true; report = null;
    progressPanel.hidden = false;
    setStage(0,'Preparing your review');
    const payload = { url: $('#website-url').value, mode: form.elements.mode.value, authorized: $('#authorized').checked };
    busy(true);
    controller = new AbortController();
    let timedOut = false, completed = false;
    const timer = setTimeout(() => { timedOut = true; controller?.abort(); }, 45000);
    try {
      const response = await fetch('/api/security-scan', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload), signal: controller.signal, cache: 'no-store' });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'The review is unavailable right now. Try again later.'); }
      if (!response.headers.get('content-type')?.includes('application/x-ndjson') || !response.body) throw new Error('The review service is unavailable. Please try again later.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder(); let buffer = '';
      function handle(line) {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === 'error') throw new Error(event.message);
        if (event.type === 'result') { completed = true; setStage(6,'Review complete'); renderReport(event.report); }
        else if (Number.isInteger(event.stage)) setStage(event.stage,event.message);
      }
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) handle(line);
        if (buffer.length > 200000) throw new Error('The report could not be read. Please try again.');
        if (done) { if (buffer) handle(buffer); break; }
      }
      if (!completed) throw new Error('The review ended before a report was ready. Please try again.');
    } catch (failure) {
      controller.abort();
      error.textContent = failure.name === 'AbortError' ? timedOut ? 'The review took too long. Try a quick review or contact us for help.' : 'Review canceled. No new report was generated.' : failure.message;
      error.hidden = false;
      consoleState.textContent = 'Review stopped';
    } finally {
      clearTimeout(timer); controller = null; busy(false); progressPanel.hidden = true;
    }
  });
  $('#download-report').addEventListener('click', () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)], { type:'application/json' }));
    const link = node('a'); link.href = url; link.download = `archwood-security-review-${new URL(report.finalUrl).hostname}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
