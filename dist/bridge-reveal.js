(function () {
  'use strict';
  const story = document.querySelector('.hero-story');
  const hero = story.querySelector('.hero');
  const camera = story.querySelector('.bridge-camera');
  const controls = story.querySelector('.bridge-console');
  const slider = document.querySelector('#bridge-range');
  const output = document.querySelector('#bridge-output');
  const followButton = document.querySelector('#bridge-follow');
  const replayButton = document.querySelector('#bridge-replay');
  const hint = document.querySelector('#bridge-hint');
  const stops = [...story.querySelectorAll('[data-bridge-stop]')];
  const motion = window.archwoodMotion;
  const timeline = new window.ArchwoodReveal.RevealTimeline(motion);
  const pinScreen = window.matchMedia('(min-width: 900px) and (min-height: 760px)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let frame = 0;
  let ready = false;
  let visible = true;
  let hiddenAt = 0;
  let pointerX = 0;
  let pointerY = 0;
  let cameraX = 0;
  let cameraY = 0;
  let cameraScale = 1;
  let lastPercent = -1;
  let lastMode = '';

  function scrollPosition() {
    const top = document.querySelector('.site-header').getBoundingClientRect().height;
    const rect = story.getBoundingClientRect();
    const distance = story.classList.contains('is-pinned')
      ? story.offsetHeight - hero.offsetHeight
      : hero.offsetHeight * 0.62;
    return window.ArchwoodReveal.clamp((top - rect.top) / Math.max(1, distance));
  }

  function setPinning() {
    const available = window.innerHeight - document.querySelector('.site-header').offsetHeight;
    const contentFits = story.querySelector('.hero-copy').scrollHeight + 110 < available;
    story.classList.toggle('is-pinned', ready && !motion.reduced && pinScreen.matches && contentFits);
  }

  function updateControls() {
    const percent = Math.round(timeline.progress * 100);
    if (percent !== lastPercent) {
      slider.value = String(percent);
      slider.setAttribute('aria-valuetext', `${percent} percent digital, ${100 - percent} percent analog`);
      output.value = percent === 0 ? 'Analog' : percent === 100 ? 'Digital' : `${percent}% digital`;
      stops.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.bridgeStop) === percent)));
      lastPercent = percent;
    }
    if (timeline.mode !== lastMode) {
      const linked = timeline.mode !== 'manual';
      followButton.setAttribute('aria-pressed', String(linked));
      followButton.textContent = linked ? 'Scroll linked' : 'Follow scroll';
      replayButton.setAttribute('aria-label', timeline.animating ? 'Restart the bridge reveal' : 'Replay the bridge reveal');
      lastMode = timeline.mode;
    }
  }

  function draw(now) {
    frame = 0;
    if (!ready || document.hidden || !visible) return;
    const progress = timeline.update(now, scrollPosition());
    const amount = (progress * 100).toFixed(3);
    story.style.setProperty('--reveal', `${amount}%`);
    story.style.setProperty('--seam-opacity', String(Math.min(1, progress * 14, (1 - progress) * 14)));

    const moving = timeline.motionAllowed;
    const targetX = moving ? 3.5 - progress * 6 + pointerY * -7 : 0;
    const targetY = moving ? -7 + progress * 12 + pointerX * 12 : 0;
    const targetScale = moving ? 0.98 + progress * 0.055 : 1;
    const smoothing = moving ? 0.12 : 1;
    cameraX += (targetX - cameraX) * smoothing;
    cameraY += (targetY - cameraY) * smoothing;
    cameraScale += (targetScale - cameraScale) * smoothing;
    camera.style.setProperty('--camera-x', `${cameraX.toFixed(3)}deg`);
    camera.style.setProperty('--camera-y', `${cameraY.toFixed(3)}deg`);
    camera.style.setProperty('--camera-scale', cameraScale.toFixed(4));
    updateControls();
    if (timeline.animating || Math.abs(targetX - cameraX) > 0.015 || Math.abs(targetY - cameraY) > 0.015 || Math.abs(targetScale - cameraScale) > 0.0002) schedule();
  }

  function schedule() {
    if (!frame && ready && visible && !document.hidden) frame = window.requestAnimationFrame(draw);
  }

  function choose(value) {
    timeline.setManual(value / 100);
    // Keyboard and touch input always update the material immediately, even with motion off.
    story.style.setProperty('--reveal', `${timeline.progress * 100}%`);
    updateControls();
    schedule();
  }

  slider.addEventListener('input', () => choose(Number(slider.value)));
  stops.forEach(button => button.addEventListener('click', () => choose(Number(button.dataset.bridgeStop))));
  replayButton.addEventListener('click', () => {
    timeline.replay(performance.now(), scrollPosition());
    schedule();
  });
  followButton.addEventListener('click', () => {
    if (timeline.mode === 'manual') timeline.follow(scrollPosition());
    else timeline.setManual(timeline.progress);
    updateControls();
    schedule();
  });

  hero.addEventListener('pointermove', event => {
    if (!finePointer.matches || !timeline.motionAllowed || event.pointerType === 'touch') return;
    const rect = hero.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) / rect.width - 0.5;
    pointerY = (event.clientY - rect.top) / rect.height - 0.5;
    schedule();
  });
  hero.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; schedule(); });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', () => { setPinning(); schedule(); }, { passive: true });
  pinScreen.addEventListener('change', () => { setPinning(); schedule(); });
  window.addEventListener('archwood:motionchange', () => {
    timeline.setMotion(motion, scrollPosition());
    syncMotionControls();
    setPinning();
    schedule();
  });

  function syncMotionControls() {
    replayButton.disabled = motion.paused;
    followButton.disabled = motion.paused;
    hint.textContent = motion.paused ? 'Drag the slider to explore at your pace.' : 'Scroll to transform. Drag to explore.';
    updateControls();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = performance.now();
      cancelAnimationFrame(frame);
      frame = 0;
    } else {
      if (hiddenAt) timeline.shiftClock(performance.now() - hiddenAt);
      hiddenAt = 0;
      schedule();
    }
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (!visible) { cancelAnimationFrame(frame); frame = 0; }
      else schedule();
    }).observe(hero);
  }

  Promise.all([...story.querySelectorAll('.bridge-state')].map(image => image.decode()))
    .then(() => {
      ready = true;
      controls.hidden = false;
      story.classList.add('bridge-ready');
      setPinning();
      timeline.start(performance.now(), scrollPosition());
      syncMotionControls();
      schedule();
      if (document.fonts) document.fonts.ready.then(() => { setPinning(); schedule(); });
    })
    .catch(() => {
      // Keep the original hero and natural page flow if either material asset cannot load.
      controls.hidden = true;
      story.classList.remove('bridge-ready', 'is-pinned');
    });
})();
