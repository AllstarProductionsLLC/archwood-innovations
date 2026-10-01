(function () {
  'use strict';
  const range = document.querySelector('#connection-range');
  const chart = document.querySelector('.allocation-chart');
  const follow = document.querySelector('#connection-follow');
  const hint = document.querySelector('#connection-hint');
  const growthValue = document.querySelector('#growth-value');
  const routineValue = document.querySelector('#routine-value');
  const growthBar = document.querySelector('#growth-bar');
  const routineBar = document.querySelector('#routine-bar');
  const output = document.querySelector('#connection-output');
  const timeline = new window.ArchwoodReveal.RevealTimeline(window.archwoodMotion);
  timeline.setManual(Number(range.value) / 100);
  let pending = 0;
  let previous = -1;

  function scrollPosition() {
    // Complete the transition while the bars are still visible, without pinning the page.
    const start = window.innerHeight * 0.82;
    const end = Math.max(100, window.innerHeight * 0.18);
    return window.ArchwoodReveal.clamp((start - chart.getBoundingClientRect().top) / Math.max(1, start - end));
  }
  function render() {
    pending = 0;
    const percent = Math.round(timeline.update(performance.now(), scrollPosition()) * 100);
    if (percent === previous) return;
    previous = percent;
    range.value = String(percent);
    const growth = Math.round(20 + percent * 0.5);
    const routine = 100 - growth;
    growthValue.textContent = String(growth);
    routineValue.textContent = String(routine);
    growthBar.style.height = `${growth}%`;
    routineBar.style.height = `${routine}%`;
    output.value = `${growth}% for strategic growth`;
    range.setAttribute('aria-valuetext', `${growth} percent strategic growth, ${routine} percent routine work`);
    chart.setAttribute('aria-label', `Illustrative time allocation: before, 80 percent routine work and 20 percent strategic growth; connected scenario, ${routine} percent routine work and ${growth} percent strategic growth.`);
  }
  function syncControls() {
    const linked = timeline.mode === 'scroll';
    follow.disabled = !timeline.motionAllowed;
    follow.setAttribute('aria-pressed', String(linked));
    follow.textContent = linked ? 'Scroll linked' : 'Follow scroll';
    hint.textContent = !timeline.motionAllowed ? 'Drag to explore. Automatic motion is off.'
      : linked ? 'Scroll to connect. Drag to explore.' : 'You’re in control. Follow scroll to reconnect.';
  }
  function schedule() {
    if (timeline.mode === 'scroll' && !document.hidden && !pending) pending = requestAnimationFrame(render);
  }
  range.addEventListener('input', () => {
    timeline.setManual(Number(range.value) / 100);
    render();
    syncControls();
  });
  follow.addEventListener('click', () => {
    timeline.follow(scrollPosition());
    render();
    syncControls();
  });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('archwood:motionchange', () => {
    timeline.setMotion(window.archwoodMotion, scrollPosition());
    render();
    syncControls();
  });
  document.addEventListener('visibilitychange', schedule);
  timeline.follow(scrollPosition());
  document.querySelector('.chart-control').hidden = false;
  render();
  syncControls();
})();
