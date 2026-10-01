const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ArchwoodReveal = require('../dist/reveal-model.js');
function setup(reduced = false) {
  const elements = new Map();
  const events = {};
  let top = 900;
  const window = { innerHeight: 1000, ArchwoodReveal, archwoodMotion: { paused: reduced, reduced }, addEventListener(name, fn) { events[name] = fn; } };
  const document = { hidden: false, querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, { value: selector === '#connection-range' ? '100' : '', style: {}, attributes: {}, listeners: {}, getBoundingClientRect: () => ({ top }), setAttribute(name, value) { this.attributes[name] = value; }, addEventListener(name, fn) { this.listeners[name] = fn; } });
    return elements.get(selector);
  }, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync('dist/impact-scroll.js', 'utf8'), { window, document, performance: { now: () => 0 }, requestAnimationFrame(fn) { fn(); return 0; } });
  const el = selector => elements.get(selector);
  return { el, window, scroll(position) { top = position; events.scroll(); }, motion(paused, reduced = false) { window.archwoodMotion = { paused, reduced }; events['archwood:motionchange'](); } };
}
test('scroll drives chart from manual to connected and reverses', () => {
  const page = setup();
  assert.equal(page.el('#growth-value').textContent, '20');
  page.scroll(500);
  assert.equal(page.el('#growth-value').textContent, '45');
  assert.equal(page.el('#routine-value').textContent, '55');
  page.scroll(180);
  assert.equal(page.el('#growth-value').textContent, '70');
  page.scroll(820);
  assert.equal(page.el('#growth-value').textContent, '20');
});
test('manual slider holds through scrolling until Follow scroll is chosen', () => {
  const page = setup();
  const range = page.el('#connection-range');
  range.value = '40'; range.listeners.input();
  page.scroll(180);
  assert.equal(range.value, '40');
  assert.equal(page.el('#growth-value').textContent, '40');
  page.el('#connection-follow').listeners.click();
  assert.equal(range.value, '100');
});
test('pause freezes chart, manual input remains available, resume preserves manual control', () => {
  const page = setup();
  page.scroll(500); page.motion(true); page.scroll(180);
  assert.equal(page.el('#growth-value').textContent, '45');
  const range = page.el('#connection-range');
  range.value = '20'; range.listeners.input();
  page.motion(false); page.scroll(180);
  assert.equal(page.el('#growth-value').textContent, '30');
});
test('reduced motion retains the connected illustration and prevents scroll updates', () => {
  const page = setup(true);
  page.scroll(500);
  assert.equal(page.el('#growth-value').textContent, '70');
  assert.equal(page.el('#connection-follow').disabled, true);
  const range = page.el('#connection-range');
  range.value = '0'; range.listeners.input();
  assert.equal(page.el('#growth-value').textContent, '20');
});
