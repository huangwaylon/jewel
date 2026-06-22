/* render.js — the Stage: one canvas holding the board + tray, plus the flyer
   and particle systems that make moves feel good. Truth lives in Game; this
   draws committed state every frame and animates beads between states. */
(function (App) {
  'use strict';
  const C = App.color;

  const PAD = 14, GAP = 14, TRAY_H = 188;
  const TRAY_ROWS = 4, TRAY_COLS = 18, TRAY_INSET = 12;

  function Stage(canvas, game) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.flyers = [];
    this.particles = [];
    this.pulses = [];          // selection ring flashes
    this.cosmic = [];          // win confetti
    this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    this.shake = 0;
    this.winGlow = 0;
    this.selBoard = new Set();   // selected (risen) board cell indices
    this.selTray = new Set();    // selected (risen) tray bead objects
    this.selT0 = 0;
    this.liftY = 0;
    this._raf = null;
    this._last = 0;
    this._cache = {};          // per-color bead gradient cache (by canvas size)
    this.resize();
  }

  Stage.prototype.now = function () { return performance.now(); };

  Stage.prototype.resize = function () {
    const rect = this.cv.getBoundingClientRect();
    const w = Math.max(200, rect.width), h = Math.max(200, rect.height);
    this.cssW = w; this.cssH = h;
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.layout();
  };

  Stage.prototype.layout = function () {
    const W = this.cssW, H = this.cssH;
    // Board + tray are one cluster (scoop from board straight into the tray
    // directly below it), vertically centered in the available space.
    const board = Math.max(120, Math.min(W - 2 * PAD, H - 2 * PAD - GAP - TRAY_H));
    const clusterH = board + GAP + TRAY_H;
    const top = PAD + Math.max(0, (H - 2 * PAD - clusterH) / 2);
    this.bx = (W - board) / 2;
    this.by = top;
    this.boardSide = board;
    this.cell = board / this.game.size;
    this.beadR = this.cell * 0.42;
    this.tray = { x: PAD, y: top + board + GAP, w: W - 2 * PAD, h: TRAY_H };

    // Fixed 3-row grid of slots inside the tray.
    const innerW = this.tray.w - 2 * TRAY_INSET, innerH = this.tray.h - 2 * TRAY_INSET;
    this.slotW = innerW / TRAY_COLS;
    this.slotH = innerH / TRAY_ROWS;
    this.traySlotR = Math.min(this.slotW, this.slotH) * 0.40;
    this.trayCap = TRAY_ROWS * TRAY_COLS;
    if (this.game) this.game.trayCap = this.trayCap;
  };

  // Center of tray slot `i` (row-major, 3 rows).
  Stage.prototype.slotCenter = function (i) {
    const col = i % TRAY_COLS, row = Math.floor(i / TRAY_COLS);
    return {
      x: this.tray.x + TRAY_INSET + this.slotW * (col + 0.5),
      y: this.tray.y + TRAY_INSET + this.slotH * (row + 0.5),
    };
  };

  // ---- geometry -------------------------------------------------------------
  Stage.prototype.cellRect = function (gx, gy) {
    const x = this.bx + gx * this.cell, y = this.by + gy * this.cell;
    return { x, y, w: this.cell, h: this.cell, cx: x + this.cell / 2, cy: y + this.cell / 2 };
  };
  Stage.prototype.hitCell = function (px, py) {
    if (px < this.bx || py < this.by || px > this.bx + this.boardSide || py > this.by + this.boardSide) return null;
    const gx = Math.floor((px - this.bx) / this.cell);
    const gy = Math.floor((py - this.by) / this.cell);
    if (gx < 0 || gy < 0 || gx >= this.game.size || gy >= this.game.size) return null;
    return { gx, gy };
  };
  Stage.prototype.hitTray = function (px, py) {
    const t = this.tray;
    return px >= t.x && py >= t.y && px <= t.x + t.w && py <= t.y + t.h;
  };
  // Which tray bead (if any) is under the point.
  Stage.prototype.hitTrayBead = function (px, py) {
    const beads = this.game.tray;
    for (let i = 0; i < beads.length && i < this.trayCap; i++) {
      const s = this.slotCenter(i);
      if (Math.hypot(px - s.x, py - s.y) <= this.traySlotR * 1.2) return beads[i];
    }
    return null;
  };
  // ---- selection (risen beads) ----------------------------------------------
  Stage.prototype.setSelection = function (boardIdx, trayBeads) {
    this.selBoard = new Set(boardIdx || []);
    this.selTray = new Set(trayBeads || []);
    this.selT0 = this.now();
  };
  Stage.prototype.clearSelection = function () {
    this.selBoard = new Set();
    this.selTray = new Set();
  };

  // ---- spawning -------------------------------------------------------------
  Stage.prototype.spawnFlyer = function (o) {
    const f = {
      color: o.color, x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1,
      t0: this.now() + (o.delay || 0), dur: o.dur || 320,
      r0: o.r0 != null ? o.r0 : this.beadR, r1: o.r1 != null ? o.r1 : this.beadR,
      arc: o.arc != null ? o.arc : -this.cell * 0.9,
      onLand: o.onLand, landed: false, spin: (o.spin || 0),
    };
    this.flyers.push(f);
    return f;
  };
  Stage.prototype.burst = function (x, y, color, n) {
    n = n || 6;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 90;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        life: 0, maxLife: 360 + Math.random() * 240, color, size: 2 + Math.random() * 2.5,
      });
    }
  };
  Stage.prototype.ring = function (gx, gy) {
    this.pulses.push({ gx, gy, t0: this.now(), dur: 360 });
  };
  Stage.prototype.kick = function (mag) { this.shake = Math.max(this.shake, mag || 6); };

  Stage.prototype.celebrate = function () {
    this.winGlow = 1;
    const cols = this.game.palette;
    for (let k = 0; k < 90; k++) {
      const col = cols[(Math.random() * cols.length) | 0] || [255, 220, 120];
      this.cosmic.push({
        x: this.bx + Math.random() * this.boardSide, y: this.by + this.boardSide * 0.4,
        vx: (Math.random() - 0.5) * 160, vy: -120 - Math.random() * 220,
        life: 0, maxLife: 1400 + Math.random() * 900, color: col,
        size: 3 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8,
      });
    }
  };

  // ---- loop -----------------------------------------------------------------
  Stage.prototype.start = function () {
    if (this._raf) return;
    this._last = this.now();
    const tick = () => { this._raf = requestAnimationFrame(tick); this.frame(); };
    this._raf = requestAnimationFrame(tick);
  };
  Stage.prototype.stop = function () { if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; };

  Stage.prototype.frame = function () {
    const t = this.now();
    const dt = Math.min(50, t - this._last); this._last = t;
    this.update(t, dt / 1000);
    this.draw(t);
  };

  Stage.prototype.update = function (t, dt) {
    // flyers
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      if (t >= f.t0 + f.dur && !f.landed) {
        f.landed = true;
        if (f.onLand) f.onLand(f);
        this.flyers.splice(i, 1);
      }
    }
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt * 1000;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 240 * dt;
      if (p.life >= p.maxLife) this.particles.splice(i, 1);
    }
    for (let i = this.cosmic.length - 1; i >= 0; i--) {
      const p = this.cosmic[i];
      p.life += dt * 1000;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; p.rot += p.vr * dt;
      if (p.life >= p.maxLife) this.cosmic.splice(i, 1);
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      if (t >= this.pulses[i].t0 + this.pulses[i].dur) this.pulses.splice(i, 1);
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 60);
    if (this.winGlow > 0) this.winGlow = Math.max(0, this.winGlow - dt * 0.25);

    // Risen-bead lift: quick ramp up then a gentle idle bob.
    if (this.selBoard.size || this.selTray.size) {
      const e = Math.min(1, (t - this.selT0) / 150);
      this.liftY = -this.beadR * 0.5 * (1 - Math.pow(1 - e, 3)) + Math.sin((t - this.selT0) / 230) * -1.6;
    } else {
      this.liftY = 0;
    }
  };

  // ---- drawing --------------------------------------------------------------
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutBack(t) { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

  Stage.prototype.draw = function (t) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    ctx.save();
    if (this.shake > 0) {
      const s = this.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    this.drawBoardPanel(ctx);
    this.drawCells(ctx, t);
    this.drawPulses(ctx, t);
    this.drawTray(ctx);
    this.drawFlyers(ctx, t);
    this.drawParticles(ctx);
    this.drawCosmic(ctx);

    ctx.restore();
  };

  Stage.prototype.drawBoardPanel = function (ctx) {
    const r = 18;
    roundRect(ctx, this.bx - 8, this.by - 8, this.boardSide + 16, this.boardSide + 16, r);
    const g = ctx.createLinearGradient(0, this.by, 0, this.by + this.boardSide);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = '#241f33';
    ctx.fill();
    ctx.fillStyle = g; ctx.fill();
    if (this.winGlow > 0) {
      ctx.save();
      ctx.globalAlpha = this.winGlow;
      ctx.shadowColor = 'rgba(255,225,150,0.9)';
      ctx.shadowBlur = 40;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,225,150,0.8)';
      roundRect(ctx, this.bx - 8, this.by - 8, this.boardSide + 16, this.boardSide + 16, r);
      ctx.stroke();
      ctx.restore();
    }
  };

  Stage.prototype.drawCells = function (ctx, t) {
    const g = this.game;
    for (let gy = 0; gy < g.size; gy++) {
      for (let gx = 0; gx < g.size; gx++) {
        const i = g.idx(gx, gy);
        const c = g.cells[i];
        if (!c.on) continue;
        const rc = this.cellRect(gx, gy);
        if (c.cur !== null) {
          if (this.selBoard.has(i)) {
            this.drawSelGlow(ctx, rc.cx, rc.cy + this.liftY, this.beadR);
            this.drawBead(ctx, rc.cx, rc.cy + this.liftY, this.beadR, g.palette[c.cur], 1);
          } else {
            this.drawBead(ctx, rc.cx, rc.cy, this.beadR, g.palette[c.cur], 1);
            if (c.cur === c.target) this.drawLock(ctx, rc.cx, rc.cy, this.beadR);
          }
        } else {
          // empty socket + ghost of the target so players know where it goes
          this.drawSocket(ctx, rc.cx, rc.cy, this.beadR);
          if (c.target !== null && !c.pending) {
            this.drawGhost(ctx, rc.cx, rc.cy, this.beadR, g.palette[c.target]);
          }
        }
      }
    }
  };

  // A bright halo under a selected (risen) bead.
  Stage.prototype.drawSelGlow = function (ctx, cx, cy, r) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = r * 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fill();
    ctx.restore();
    // soft drop shadow on the board where it lifted from
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 1.1, r * 0.55, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
  };

  // A settled, "locked" bead: warm rim glow so solved beads read as fixed.
  Stage.prototype.drawLock = function (ctx, cx, cy, r) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1.5, r * 0.12);
    ctx.strokeStyle = 'rgba(255,221,140,0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.96, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  Stage.prototype.drawSocket = function (ctx, cx, cy, r) {    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
  };
  Stage.prototype.drawGhost = function (ctx, cx, cy, r, col) {
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = C.rgbCss(col);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.rgbCss(col);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  // Glossy candy bead.
  Stage.prototype.drawBead = function (ctx, cx, cy, r, col, alpha) {
    if (alpha != null && alpha < 1) { ctx.save(); ctx.globalAlpha = alpha; }
    const light = C.mix(col, [255, 255, 255], 0.55);
    const dark = C.mix(col, [0, 0, 0], 0.32);
    // drop shadow
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.16, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();
    // body
    const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    g.addColorStop(0, C.rgbCss(light));
    g.addColorStop(0.45, C.rgbCss(col));
    g.addColorStop(1, C.rgbCss(dark));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    // specular highlight
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.32, cy - r * 0.38, r * 0.30, r * 0.20, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fill();
    if (alpha != null && alpha < 1) ctx.restore();
  };

  Stage.prototype.drawPulses = function (ctx, t) {
    for (const p of this.pulses) {
      const k = (t - p.t0) / p.dur;
      if (k < 0 || k > 1) continue;
      const rc = this.cellRect(p.gx, p.gy);
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.arc(rc.cx, rc.cy, this.beadR * (0.8 + k * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  Stage.prototype.drawTray = function (ctx) {
    const tr = this.tray;
    roundRect(ctx, tr.x, tr.y, tr.w, tr.h, 20);
    const g = ctx.createLinearGradient(0, tr.y, 0, tr.y + tr.h);
    g.addColorStop(0, '#322a45');
    g.addColorStop(1, '#26203a');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, tr.x, tr.y, tr.w, tr.h, 20); ctx.stroke();

    // Fixed grid of empty slots.
    for (let i = 0; i < this.trayCap; i++) {
      const s = this.slotCenter(i);
      ctx.beginPath();
      ctx.arc(s.x, s.y, this.traySlotR * 0.96, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.stroke();
    }

    // Real beads in their slots, gliding toward their target slot (reflow).
    const beads = this.game.tray;
    for (let i = 0; i < beads.length && i < this.trayCap; i++) {
      const b = beads[i];
      const s = this.slotCenter(i);
      if (b.rx == null) { b.rx = s.x; b.ry = s.y; }
      else { b.rx += (s.x - b.rx) * 0.30; b.ry += (s.y - b.ry) * 0.30; }
      const dy = this.selTray.has(b) ? this.liftY : 0;
      if (dy) this.drawSelGlow(ctx, b.rx, b.ry + dy, this.traySlotR);
      this.drawBead(ctx, b.rx, b.ry + dy, this.traySlotR, this.game.palette[b.ci], 1);
    }
  };

  Stage.prototype.drawFlyers = function (ctx, t) {
    for (const f of this.flyers) {
      let k = (t - f.t0) / f.dur;
      if (k < 0) continue;            // still in its stagger delay
      if (k > 1) k = 1;
      const e = easeOutCubic(k);
      const x = f.x0 + (f.x1 - f.x0) * e;
      const arc = f.arc * Math.sin(Math.PI * k);
      const y = f.y0 + (f.y1 - f.y0) * e + arc;
      const r = f.r0 + (f.r1 - f.r0) * easeOutBack(Math.min(1, k * 1.2));
      this.drawBead(ctx, x, y, r, f.color, 1);
    }
  };

  Stage.prototype.drawParticles = function (ctx) {
    for (const p of this.particles) {
      const a = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = C.rgbCss(p.color);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  Stage.prototype.drawCosmic = function (ctx) {
    for (const p of this.cosmic) {
      const a = 1 - p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = C.rgbCss(p.color);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  Stage.prototype.busy = function () { return this.flyers.length > 0; };

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  App.Stage = Stage;
})(window.App = window.App || {});
