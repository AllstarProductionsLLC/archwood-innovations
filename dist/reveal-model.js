(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ArchwoodReveal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clamp = value => Math.min(1, Math.max(0, Number(value) || 0));
  const ease = value => value < 0.5 ? 4 * value ** 3 : 1 - ((-2 * value + 2) ** 3) / 2;

  class RevealTimeline {
    constructor({ paused = false, reduced = false } = {}) {
      this.paused = paused;
      this.reduced = reduced;
      this.progress = 0.5;
      this.mode = 'manual';
      this.lastScroll = 0;
      this.anchorScroll = 0;
      this.anchorProgress = 0;
      this.automatic = null;
      this.resumeFollowing = false;
    }

    get motionAllowed() { return !this.paused && !this.reduced; }
    get animating() { return Boolean(this.automatic && this.motionAllowed); }

    start(now, scroll = 0) {
      this.lastScroll = clamp(scroll);
      if (!this.motionAllowed) return;
      if (scroll > 0.03) { this.follow(scroll); return; }
      this.progress = 0;
      this.mode = 'intro';
      this.resumeFollowing = true;
      this.automatic = { start: now, duration: 3400, end: 0.58 };
    }

    setManual(value) {
      this.progress = clamp(value);
      this.automatic = null;
      this.mode = 'manual';
      this.resumeFollowing = false;
    }

    replay(now, scroll) {
      if (!this.motionAllowed) return false;
      this.progress = 0;
      this.lastScroll = clamp(scroll);
      this.mode = 'replay';
      this.resumeFollowing = true;
      this.automatic = { start: now, duration: 4200, end: 1 };
      return true;
    }

    follow(scroll) {
      if (!this.motionAllowed) return false;
      this.automatic = null;
      this.mode = 'scroll';
      this.resumeFollowing = true;
      this.anchorScroll = 0;
      this.anchorProgress = 0;
      this.lastScroll = clamp(scroll);
      this.progress = this.lastScroll;
      return true;
    }

    anchor(scroll) {
      this.mode = 'scroll';
      this.resumeFollowing = true;
      this.automatic = null;
      this.anchorScroll = clamp(scroll);
      this.anchorProgress = this.progress;
    }

    setMotion({ paused, reduced }, scroll) {
      const wasAllowed = this.motionAllowed;
      this.paused = Boolean(paused);
      this.reduced = Boolean(reduced);
      this.lastScroll = clamp(scroll);
      if (!this.motionAllowed) {
        if (wasAllowed) this.resumeFollowing = this.mode !== 'manual';
        this.automatic = null;
        this.mode = 'manual';
      } else if (!wasAllowed && this.resumeFollowing) this.anchor(scroll);
    }

    shiftClock(milliseconds) {
      if (this.automatic) this.automatic.start += Math.max(0, milliseconds);
    }

    update(now, scroll) {
      const position = clamp(scroll);
      if (!this.motionAllowed || this.mode === 'manual') {
        this.lastScroll = position;
        return this.progress;
      }
      if (this.automatic && Math.abs(position - this.lastScroll) > 0.003) {
        // A scroll gesture takes over from the exact visible frame, without snapping.
        this.anchor(this.lastScroll);
      }
      if (this.automatic) {
        const t = clamp((now - this.automatic.start) / this.automatic.duration);
        this.progress = ease(t) * this.automatic.end;
        if (t >= 1) {
          if (this.mode === 'replay') this.setManual(this.progress);
          else this.anchor(position);
        }
      } else if (this.mode === 'scroll') {
        if (position >= this.anchorScroll) {
          const remaining = 1 - this.anchorScroll;
          this.progress = remaining > 0.0001
            ? this.anchorProgress + (1 - this.anchorProgress) * (position - this.anchorScroll) / remaining
            : this.anchorProgress;
        } else {
          this.progress = this.anchorScroll > 0.0001
            ? this.anchorProgress * position / this.anchorScroll
            : this.anchorProgress;
        }
      }
      this.progress = clamp(this.progress);
      this.lastScroll = position;
      return this.progress;
    }
  }

  return { RevealTimeline, clamp };
});
