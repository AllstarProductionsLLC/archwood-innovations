(function () {
  'use strict';
  const sectors = {
    business: { title: 'Connect the work behind the business.', description: 'Bring enquiries, follow-ups, and day-to-day operations into a more connected flow, with tools built around your team.', service: 'service-automation', link: 'Explore automation & conversations' },
    education: { title: 'Give educators more space to teach.', description: 'Explore tools that make information easier to find, streamline administration, and support the people behind the learning experience.', service: 'service-intelligence', link: 'Explore intelligence & custom software' },
    media: { title: 'From idea to audience, with fewer handoffs.', description: 'Connect content, campaigns, and community through a digital presence that carries your message consistently.', service: 'service-marketing', link: 'Explore marketing & social ecosystems' },
    technology: { title: 'Move from prototype to product.', description: 'Turn a useful idea into a working application, with custom software and AI integration that can evolve with your business.', service: 'service-intelligence', link: 'Explore intelligence & custom software' },
    finance: { title: 'Make information easier to work with.', description: 'Explore ways to organize information and reduce repetitive administration, with tools designed around your team’s review process.', service: 'service-intelligence', link: 'Explore intelligence & custom software' }
  };
  const tabs = [...document.querySelectorAll('[data-sector]')];
  const panel = document.querySelector('#sector-panel');
  const sectorLink = document.querySelector('#sector-link');
  function selectSector(tab) {
    const data = sectors[tab.dataset.sector];
    tabs.forEach(button => {
      button.setAttribute('aria-selected', String(button === tab));
      button.tabIndex = button === tab ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', tab.id);
    document.querySelector('#sector-title').textContent = data.title;
    document.querySelector('#sector-description').textContent = data.description;
    sectorLink.href = `#${data.service}`;
    sectorLink.firstChild.textContent = `${data.link} `;
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectSector(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectSector(tabs[next]);
      tabs[next].focus();
    });
  });
  sectorLink.addEventListener('click', () => {
    const target = document.querySelector(sectorLink.hash);
    if (target) {
      target.open = true;
      target.querySelector('summary').focus({ preventScroll: true });
    }
  });
  selectSector(tabs[0]);
  document.querySelector('.sector-explorer').hidden = false;
  document.querySelector('.sector-fallback').hidden = true;

  const lab = document.querySelector('.workflow-lab');
  const steps = [...lab.querySelectorAll('.workflow-track li')];
  const run = document.querySelector('#workflow-run');
  const status = document.querySelector('#workflow-status');
  const radios = [...lab.querySelectorAll('[name="workflow-mode"]')];
  const manualLabels = ['Start the example', 'Copy the details', 'Draft the reply', 'Pass to the team', 'Restart the example'];
  const manualStatus = [
    'Move through the example one manual step at a time.',
    'An enquiry arrives. Someone needs to copy its details into the CRM.',
    'The CRM is updated. Someone needs to prepare the first reply.',
    'The reply is drafted. Someone needs to pass it to the team.',
    'Ready for review. You moved the enquiry through three manual handoffs.'
  ];
  let mode = 'manual';
  let completed = 0;
  let running = false;
  let timer = 0;
  let generation = 0;

  function cancelRun() { clearTimeout(timer); timer = 0; generation += 1; running = false; }
  function renderWorkflow() {
    lab.dataset.mode = mode;
    lab.classList.toggle('is-running', running);
    steps.forEach((step, index) => {
      const done = index < completed;
      const current = index === completed - 1;
      step.classList.toggle('is-complete', done);
      step.classList.toggle('is-current', current);
      step.querySelector('.workflow-state').textContent = done ? (current && completed < 4 ? 'Current step' : 'Complete') : 'Waiting';
    });
    run.disabled = running;
    run.firstChild.textContent = mode === 'manual'
      ? `${manualLabels[completed]} `
      : running ? 'Following the workflow… ' : completed === 4 ? 'Replay the example ' : 'Run the example ';
    status.textContent = mode === 'manual' ? manualStatus[completed]
      : completed === 0 ? 'Run the example to see the defined handoffs stay connected.'
      : completed === 4 ? 'Ready for review. The defined handoffs are connected, and your team takes it from here.'
      : ['','Enquiry received. The workflow carries the details forward.','Details recorded. The workflow prepares a first reply.','Reply prepared. The workflow passes it to the team.'][completed];
  }

  function advanceConnected(runId) {
    if (runId !== generation) return;
    completed += 1;
    if (completed === steps.length) running = false;
    renderWorkflow();
    if (running) timer = setTimeout(() => advanceConnected(runId), 850);
  }

  radios.forEach(radio => radio.addEventListener('change', () => {
    if (!radio.checked) return;
    cancelRun();
    mode = radio.value;
    completed = 0;
    renderWorkflow();
  }));
  run.addEventListener('click', () => {
    if (mode === 'manual') {
      completed = completed === steps.length ? 0 : completed + 1;
      renderWorkflow();
    } else {
      cancelRun();
      completed = 0;
      if (window.archwoodMotion.paused) { completed = steps.length; renderWorkflow(); }
      else { running = true; advanceConnected(generation); }
    }
  });
  function finishWithoutMotion() {
    if (!running) return;
    cancelRun();
    completed = steps.length;
    renderWorkflow();
  }
  window.addEventListener('archwood:motionchange', () => { if (window.archwoodMotion.paused) finishWithoutMotion(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) finishWithoutMotion(); });
  lab.hidden = false;
  renderWorkflow();
})();
