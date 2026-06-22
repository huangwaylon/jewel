/* game.js — pure game state & rules. The animation layer (render/main) owns
   timing; this module owns truth: targets, current beads, the tray bag, and
   the flood-fill "smart selection". */
(function (App) {
  'use strict';

  function Game(puzzle) {
    this.size = puzzle.size;
    this.palette = puzzle.palette;
    const n = this.size * this.size;
    this.cells = new Array(n);
    for (let i = 0; i < n; i++) this.cells[i] = { on: false, target: null, cur: null, pending: false };
    for (const c of puzzle.cells) {
      if (!c.on) continue;
      const i = c.gy * this.size + c.gx;
      this.cells[i].on = true;
      this.cells[i].target = c.ci;
      this.cells[i].cur = c.ci;       // start solved; scramble() messes it up
    }
    this.tray = [];                   // ordered bead objects { ci } held in the tray
    this.trayCap = Infinity;          // slot count; set by the view (3 rows x cols)
    this.onCount = this.cells.filter(c => c.on).length;
  }

  Game.prototype.idx = function (gx, gy) { return gy * this.size + gx; };
  Game.prototype.inBounds = function (gx, gy) {
    return gx >= 0 && gy >= 0 && gx < this.size && gy < this.size;
  };

  // ---- tray -----------------------------------------------------------------
  // The tray is a fixed grid of slots that fills with real beads. We keep an
  // ordered array; the view draws bead i in slot i and reflows on removal.
  Game.prototype.trayFree = function () { return Math.max(0, this.trayCap - this.tray.length); };
  Game.prototype.trayPush = function (ci) { const b = { ci }; this.tray.push(b); return b; };
  // Remove up to n beads of color ci (trailing-first to minimize reflow); return them.
  Game.prototype.trayRemove = function (ci, n) {
    const out = [];
    for (let i = this.tray.length - 1; i >= 0 && out.length < n; i--) {
      if (this.tray[i].ci === ci) { out.push(this.tray[i]); this.tray.splice(i, 1); }
    }
    return out;
  };
  Game.prototype.bagCount = function (ci) {
    let n = 0; for (const b of this.tray) if (b.ci === ci) n++; return n;
  };
  Game.prototype.bagTotal = function () { return this.tray.length; };

  // ---- cell mutators (driven by animations) --------------------------------
  Game.prototype.liftCell = function (i) {        // remove bead, return its color
    const ci = this.cells[i].cur;
    this.cells[i].cur = null;
    return ci;
  };
  Game.prototype.reserve = function (i) { this.cells[i].pending = true; };
  Game.prototype.fillCell = function (i, ci) {
    this.cells[i].cur = ci;
    this.cells[i].pending = false;
  };

  // ---- smart selection ------------------------------------------------------
  // Connected run of cells currently showing the same color as (gx,gy).
  // Correctly-placed beads (cur === target) are locked: they can't be picked
  // up and act as walls, so a clump never includes them.
  Game.prototype.selectClump = function (gx, gy) {
    const start = this.idx(gx, gy);
    const cell = this.cells[start];
    if (!cell.on || cell.cur === null || cell.pending) return null;
    if (cell.cur === cell.target) return null;   // locked in place
    const color = cell.cur;
    return { color, cells: this._flood(gx, gy, (c) => c.cur === color && !c.pending && c.cur !== c.target) };
  };

  Game.prototype.isLocked = function (i) {
    const c = this.cells[i];
    return c.on && c.cur !== null && c.cur === c.target;
  };

  // Connected run of EMPTY cells that share the same target color as (gx,gy).
  // This is where a held color belongs, so placement is always "correct".
  Game.prototype.selectHole = function (gx, gy) {
    const start = this.idx(gx, gy);
    const cell = this.cells[start];
    if (!cell.on || cell.cur !== null || cell.pending) return null;
    const target = cell.target;
    return { target, cells: this._flood(gx, gy, (c) => c.cur === null && !c.pending && c.target === target) };
  };

  // All empty cells (anywhere) whose target color is `ci`, nearest-first to a point.
  Game.prototype.holesForColor = function (ci, nearGx, nearGy) {
    const out = [];
    for (let gy = 0; gy < this.size; gy++) for (let gx = 0; gx < this.size; gx++) {
      const c = this.cells[this.idx(gx, gy)];
      if (c.on && c.cur === null && !c.pending && c.target === ci) {
        const d = (gx - nearGx) * (gx - nearGx) + (gy - nearGy) * (gy - nearGy);
        out.push({ gx, gy, i: this.idx(gx, gy), d });
      }
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  };

  Game.prototype._flood = function (gx, gy, pred) {
    const seen = new Set();
    const out = [];
    const stack = [[gx, gy]];
    // 8-connected: diagonals count as part of the same group / region too.
    const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (stack.length) {
      const [x, y] = stack.pop();
      const i = this.idx(x, y);
      if (seen.has(i)) continue;
      seen.add(i);
      const c = this.cells[i];
      if (!c.on || !pred(c)) continue;
      out.push({ gx: x, gy: y, i });
      for (const [dx, dy] of NB) {
        if (this.inBounds(x + dx, y + dy)) stack.push([x + dx, y + dy]);
      }
    }
    return out;
  };

  // ---- scramble -------------------------------------------------------------
  // Shuffle the beads (conserves counts → always solvable) and then repair
  // fixed points so NO bead starts on its target cell: every bead is movable
  // from the start. (Possible only because pixelize caps any color at <=~50%.)
  Game.prototype.scramble = function (rng) {
    rng = rng || Math.random;
    const idx = [];
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i].on) idx.push(i);
    if (idx.length < 2) return;

    // Fisher-Yates shuffle of the bead colors across the cells.
    const beads = idx.map((i) => this.cells[i].target);
    for (let k = beads.length - 1; k > 0; k--) {
      const j = (rng() * (k + 1)) | 0;
      const t = beads[k]; beads[k] = beads[j]; beads[j] = t;
    }
    for (let k = 0; k < idx.length; k++) this.cells[idx[k]].cur = beads[k];

    this._removeFixedPoints(idx, rng);
  };

  // Swap-repair: for each cell still showing its target color, find a partner
  // swap that un-fixes it without creating a new fixed point (prefer a partner
  // that is itself fixed, killing two at once).
  Game.prototype._removeFixedPoints = function (idx, rng) {
    const cells = this.cells;
    for (let pass = 0; pass < 12; pass++) {
      const fixed = idx.filter((i) => cells[i].cur === cells[i].target);
      if (fixed.length === 0) break;
      let progressed = false;
      for (const i of fixed) {
        if (cells[i].cur !== cells[i].target) continue;     // already repaired
        const ci = cells[i].cur, ti = cells[i].target;
        let cand = -1, candFixed = -1;
        for (const j of idx) {
          if (j === i) continue;
          const cj = cells[j].cur, tj = cells[j].target;
          if (cj !== ti && ci !== tj) {                     // safe swap
            if (cj === tj) { candFixed = j; break; }        // j also fixed → ideal
            if (cand < 0) cand = j;
          }
        }
        const j = candFixed >= 0 ? candFixed : cand;
        if (j >= 0) {
          cells[i].cur = cells[j].cur; cells[j].cur = ci;
          progressed = true;
        }
      }
      if (!progressed) break;
    }
  };

  // ---- status ---------------------------------------------------------------
  Game.prototype.isWon = function () {
    for (const c of this.cells) if (c.on && c.cur !== c.target) return false;
    return true;
  };
  Game.prototype.progress = function () {
    let correct = 0;
    for (const c of this.cells) if (c.on && c.cur === c.target) correct++;
    return this.onCount ? correct / this.onCount : 1;
  };

  App.Game = Game;
})(window.App = window.App || {});
