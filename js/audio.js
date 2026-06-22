/* audio.js — tiny WebAudio synth for tactile feedback. No assets, no network.
   iOS Safari needs the context resumed inside a user gesture. */
(function (App) {
  'use strict';

  function Audio() {
    this.ctx = null;
    this.muted = false;
    this._lastTick = 0;
    this.master = null;
  }

  Audio.prototype.resume = function () {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  };

  Audio.prototype.toggle = function () {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  };

  // one short voice
  Audio.prototype.blip = function (freq, dur, type, gain, when) {
    if (!this.ctx || this.muted) return;
    const t = (when || this.ctx.currentTime);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.25, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  };

  // pitch glide voice (for scoop swoosh)
  Audio.prototype.glide = function (f0, f1, dur, type, gain) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  };

  const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C D E G A C

  Audio.prototype.scoop = function (n) { this.glide(280, 620, 0.18, 'triangle', 0.18); };
  Audio.prototype.pour = function (n) { this.glide(620, 360, 0.16, 'sine', 0.16); };

  // soft ticks as beads land in the tray (rate-limited, rising pitch)
  Audio.prototype.tick = function () {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this._lastTick < 0.025) return;
    this._lastTick = now;
    this.blip(880 + Math.random() * 120, 0.06, 'sine', 0.12);
  };
  // bright pluck as a bead snaps into the picture
  Audio.prototype.plink = function () {
    const f = PENTA[(Math.random() * PENTA.length) | 0];
    this.blip(f, 0.18, 'triangle', 0.16);
  };
  Audio.prototype.reject = function () { this.blip(150, 0.14, 'sawtooth', 0.12); };

  Audio.prototype.win = function () {
    if (!this.ctx || this.muted) return;
    const base = this.ctx.currentTime;
    [0, 1, 2, 3, 5].forEach((i, k) => {
      this.blip(PENTA[Math.min(i, PENTA.length - 1)], 0.45, 'triangle', 0.2, base + k * 0.1);
    });
  };

  App.Audio = Audio;
})(window.App = window.App || {});
