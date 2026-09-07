const test = require('node:test');
const assert = require('node:assert/strict');
const { RevealTimeline } = require('../dist/reveal-model.js');

test('dragging takes control from the opening sequence and holds the selected material', () => {
  const timeline = new RevealTimeline();
  timeline.start(0, 0);
  timeline.update(1200, 0);
  timeline.setManual(0.76);
  assert.equal(timeline.update(9000, 0.8), 0.76);
  assert.equal(timeline.mode, 'manual');
  assert.equal(timeline.animating, false);
});

test('scrolling takes over an unfinished opening sequence without rewinding it', () => {
  const timeline = new RevealTimeline();
  timeline.start(0, 0);
  const visible = timeline.update(1500, 0);
  const interrupted = timeline.update(1520, 0.01);
  assert.ok(interrupted >= visible && interrupted - visible < 0.02);
  assert.equal(timeline.mode, 'scroll');
  assert.equal(timeline.update(3000, 1), 1);
});

test('explicit scroll linking reaches both endpoints and reverses correctly', () => {
  const timeline = new RevealTimeline();
  timeline.setManual(0.8);
  timeline.follow(0.2);
  assert.equal(timeline.progress, 0.2);
  assert.equal(timeline.update(100, 1), 1);
  assert.equal(timeline.update(200, 0), 0);
  assert.equal(timeline.update(300, 0.4), 0.4);
});

test('replay ends once, holds the digital frame, and can be restarted', () => {
  const timeline = new RevealTimeline();
  assert.equal(timeline.replay(100, 0), true);
  assert.equal(timeline.update(5000, 0), 1);
  assert.equal(timeline.mode, 'manual');
  assert.equal(timeline.animating, false);
  assert.equal(timeline.update(20000, 0), 1);
  assert.equal(timeline.replay(21000, 0), true);
  assert.equal(timeline.progress, 0);
});

test('pause freezes the visible frame and resume continues from that frame', () => {
  const timeline = new RevealTimeline();
  timeline.follow(0.3);
  timeline.setMotion({ paused: true, reduced: false }, 0.3);
  assert.equal(timeline.update(5000, 0.5), 0.3);
  timeline.setMotion({ paused: false, reduced: false }, 0.5);
  assert.equal(timeline.update(5100, 0.5), 0.3);
  assert.equal(timeline.update(6000, 1), 1);
});

test('a manual choice made while paused stays manual when motion is enabled', () => {
  const timeline = new RevealTimeline();
  timeline.follow(0.2);
  timeline.setMotion({ paused: true, reduced: false }, 0.2);
  timeline.setManual(0.9);
  timeline.setMotion({ paused: false, reduced: false }, 0.3);
  assert.equal(timeline.update(1000, 0.7), 0.9);
  assert.equal(timeline.mode, 'manual');
});

test('reduced motion keeps automatic effects off and allows direct control', () => {
  const timeline = new RevealTimeline({ reduced: true });
  timeline.start(0, 0);
  assert.equal(timeline.animating, false);
  assert.equal(timeline.replay(100, 0), false);
  assert.equal(timeline.follow(0.8), false);
  timeline.setManual(1);
  assert.equal(timeline.update(10000, 0.7), 1);
  timeline.setManual(0);
  assert.equal(timeline.progress, 0);
});

test('returning from a hidden tab does not skip through the opening sequence', () => {
  const timeline = new RevealTimeline();
  timeline.start(0, 0);
  const visible = timeline.update(1000, 0);
  timeline.shiftClock(20000);
  assert.equal(timeline.update(21000, 0), visible);
  assert.equal(timeline.animating, true);
});

test('out-of-range input cannot produce invalid material masks', () => {
  const timeline = new RevealTimeline();
  timeline.setManual(-10);
  assert.equal(timeline.progress, 0);
  timeline.setManual(20);
  assert.equal(timeline.progress, 1);
  timeline.setManual(Number.NaN);
  assert.equal(timeline.progress, 0);
});
