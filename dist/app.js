'use strict';

// Enhance native HTML. Navigation, service details, and contact links work without JS.
document.body.classList.add('js-ready');

const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#main-navigation');
const smallScreen = window.matchMedia('(max-width: 600px)');

function setMenu(open, restoreFocus = false) {
  navigation.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.querySelector('span').textContent = open ? 'Close' : 'Menu';
  document.body.classList.toggle('menu-open', open);
  // Hidden mobile links cannot receive focus when the menu is closed.
  navigation.inert = smallScreen.matches && !open;
  if (restoreFocus) menuButton.focus();
}

menuButton.hidden = false;
menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  setMenu(false);
  // Preserve a logical keyboard position after choosing a mobile menu destination.
  const destination = document.querySelector(link.getAttribute('href'));
  if (destination && smallScreen.matches) {
    destination.setAttribute('tabindex', '-1');
    destination.focus({ preventScroll: true });
    destination.addEventListener('blur', () => destination.removeAttribute('tabindex'), { once: true });
  }
}));
smallScreen.addEventListener('change', () => setMenu(false));
setMenu(false);

document.addEventListener('keydown', event => {
  if (menuButton.getAttribute('aria-expanded') !== 'true') return;
  if (event.key === 'Escape') setMenu(false, true);
  if (event.key === 'Tab') {
    const focusable = [menuButton, ...navigation.querySelectorAll('a')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }
});

// Keep one service open in browsers that do not yet support details[name].
const services = [...document.querySelectorAll('.service')];
services.forEach(service => service.addEventListener('toggle', () => {
  if (service.open) services.forEach(other => { if (other !== service) other.open = false; });
}));

// The deck's 80/20 and 30/70 allocation is an illustration, never a client claim.
const range = document.querySelector('#connection-range');
const growthValue = document.querySelector('#growth-value');
const routineValue = document.querySelector('#routine-value');
const growthBar = document.querySelector('#growth-bar');
const routineBar = document.querySelector('#routine-bar');
const allocationChart = document.querySelector('.allocation-chart');
const connectionOutput = document.querySelector('#connection-output');

function updateAllocation() {
  const transition = Math.max(0, Math.min(100, Number(range.value)));
  const growth = Math.round(20 + transition * 0.5);
  const routine = 100 - growth;
  growthValue.textContent = String(growth);
  routineValue.textContent = String(routine);
  growthBar.style.height = `${growth}%`;
  routineBar.style.height = `${routine}%`;
  connectionOutput.value = `${growth}% for strategic growth`;
  range.setAttribute('aria-valuetext', `${growth} percent strategic growth, ${routine} percent routine work`);
  allocationChart.setAttribute('aria-label', `Illustrative time allocation: before, 80 percent routine work and 20 percent strategic growth; connected scenario, ${routine} percent routine work and ${growth} percent strategic growth.`);
}
document.querySelector('.chart-control').hidden = false;
range.addEventListener('input', updateAllocation);
updateAllocation();

// A light response to pointer and scroll gives the bridge depth, without WebGL.
const hero = document.querySelector('.hero');
const bridge = document.querySelector('.bridge-art');
const motionToggle = document.querySelector('#motion-toggle');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const precisePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
let userPaused = false;
let animationFrame = 0;
let pointerX = 0;
let pointerY = 0;
let heroVisible = true;

function motionAllowed() { return !reducedMotion.matches && !userPaused && !document.hidden; }
function resetBridge() {
  bridge.style.setProperty('--pointer-x', '0px');
  bridge.style.setProperty('--pointer-y', '0px');
  bridge.style.setProperty('--rotate-x', '0deg');
  bridge.style.setProperty('--rotate-y', '0deg');
}
function renderBridge() {
  animationFrame = 0;
  if (!motionAllowed() || !heroVisible) return;
  const rect = hero.getBoundingClientRect();
  const scrollDepth = Math.min(1, Math.max(0, -rect.top / rect.height));
  bridge.style.setProperty('--pointer-x', `${pointerX * 8}px`);
  bridge.style.setProperty('--pointer-y', `${pointerY * 6 + scrollDepth * 24}px`);
  bridge.style.setProperty('--rotate-x', `${-pointerY * 1.1}deg`);
  bridge.style.setProperty('--rotate-y', `${pointerX * 1.8}deg`);
}
function requestBridgeFrame() {
  if (!animationFrame && motionAllowed() && heroVisible) animationFrame = requestAnimationFrame(renderBridge);
}
hero.addEventListener('pointermove', event => {
  if (!precisePointer.matches || !motionAllowed()) return;
  const rect = hero.getBoundingClientRect();
  pointerX = (event.clientX - rect.left) / rect.width - 0.5;
  pointerY = (event.clientY - rect.top) / rect.height - 0.5;
  requestBridgeFrame();
});
hero.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; requestBridgeFrame(); });
window.addEventListener('scroll', requestBridgeFrame, { passive: true });
function syncMotion() {
  const paused = userPaused || reducedMotion.matches;
  document.body.classList.toggle('motion-paused', paused);
  motionToggle.hidden = reducedMotion.matches;
  motionToggle.setAttribute('aria-pressed', String(paused));
  motionToggle.querySelector('.motion-label').textContent = paused ? 'Enable motion' : 'Pause motion';
  motionToggle.querySelector('.motion-symbol').textContent = paused ? '▷' : 'Ⅱ';
  if (paused) { cancelAnimationFrame(animationFrame); animationFrame = 0; resetBridge(); }
  else requestBridgeFrame();
}
motionToggle.addEventListener('click', () => { userPaused = !userPaused; syncMotion(); });
reducedMotion.addEventListener('change', syncMotion);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(animationFrame); animationFrame = 0; }
  else requestBridgeFrame();
});
syncMotion();

if ('IntersectionObserver' in window) {
  new IntersectionObserver(entries => {
    heroVisible = entries[0].isIntersecting;
    if (heroVisible) requestBridgeFrame();
  }).observe(hero);
  const navLinks = [...navigation.querySelectorAll('a[href^="#"]')];
  const sectionObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        navLinks.forEach(link => {
          if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      }
    }
  }, { rootMargin: '-20% 0px -55% 0px', threshold: 0 });
  document.querySelectorAll('main>section').forEach(section => sectionObserver.observe(section));
}
document.querySelector('#year').textContent = String(new Date().getFullYear());
