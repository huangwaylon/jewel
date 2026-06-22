/* main.js — wiring: input → game rules → choreographed animation, plus audio,
   levels, HUD and the win flow. */
(function (App) {
  'use strict';

  const EMOJIS = [
    { e: '🍓', name: 'Strawberry' },
    { e: '🌸', name: 'Blossom' },
    { e: '🐙', name: 'Octopus' },
    { e: '🍉', name: 'Watermelon' },
    { e: '⭐', name: 'Star' },
    { e: '🐠', name: 'Tropical Fish' },
    { e: '🍄', name: 'Mushroom' },
    { e: '🦋', name: 'Butterfly' },
    { e: '🌈', name: 'Rainbow' },
    { e: '🍦', name: 'Ice Cream' },
    { e: '🐢', name: 'Turtle' },
    { e: '🌺', name: 'Hibiscus' },
    { e: '🍳', name: 'Fried Egg' },
    { e: '🐝', name: 'Bee' },
    { e: '🍎', name: 'Apple' },
    { e: '👾', name: 'Alien' },
    { e: '🌼', name: 'Daisy' },
    { e: '🦀', name: 'Crab' },
    { e: '🍋', name: 'Lemon' },
    { e: '🍊', name: 'Orange' },
    { e: '🍒', name: 'Cherries' },
    { e: '🍑', name: 'Peach' },
    { e: '🍇', name: 'Grapes' },
    { e: '🥝', name: 'Kiwi' },
    { e: '🫐', name: 'Blueberries' },
    { e: '🥑', name: 'Avocado' },
    { e: '🌻', name: 'Sunflower' },
    { e: '🌷', name: 'Tulip' },
    { e: '🍀', name: 'Clover' },
    { e: '🐱', name: 'Cat' },
    { e: '🐶', name: 'Dog' },
    { e: '🦊', name: 'Fox' },
    { e: '🐸', name: 'Frog' },
    { e: '🐬', name: 'Dolphin' },
    { e: '🦄', name: 'Unicorn' },
    { e: '🐧', name: 'Penguin' },
    { e: '🐞', name: 'Ladybug' },
    { e: '🦉', name: 'Owl' },
    { e: '🌙', name: 'Moon' },
    { e: '☀️', name: 'Sun' },
    { e: '❤️', name: 'Heart' },
    { e: '🔥', name: 'Fire' },
    { e: '⚡', name: 'Bolt' },
    { e: '🎈', name: 'Balloon' },
    { e: '🍩', name: 'Donut' },
    { e: '🧁', name: 'Cupcake' },
    { e: '🍭', name: 'Lollipop' },
    { e: '🎀', name: 'Bow' },
    { e: '🌴', name: 'Palm Tree' },
    { e: '🚀', name: 'Rocket' },
    { e: '⚽', name: 'Soccer Ball' },
    { e: '🪼', name: 'Jellyfish' },
  ];

  const GRID = 16;
  const COLORS = 5;

  let game, stage, sfx;
  let sel = null;       // current selection: {src:'board'|'tray', color, cells?|beads?}
  let levelIdx = 0;
  let won = false;

  const $ = (id) => document.getElementById(id);

  function init() {
    sfx = new App.Audio();
    const canvas = $('stage');

    window.addEventListener('resize', () => { if (stage) { stage.resize(); } });
    window.addEventListener('orientationchange', () => setTimeout(() => stage && stage.resize(), 200));

    $('new-btn').addEventListener('click', () => { sfx.resume(); nextLevel(); });
    $('again-btn').addEventListener('click', () => { sfx.resume(); nextLevel(); });
    $('mute-btn').addEventListener('click', () => {
      const m = sfx.toggle();
      $('mute-btn').textContent = m ? '🔇' : '🔊';
    });

    bindInput(canvas);
    loadLevel(0);
  }

  function buildPuzzle(emoji) {
    // Retry a couple of times in case quantization yields too few colors.
    let p = App.pixelize(emoji, { size: GRID, colors: COLORS });
    return p;
  }

  // Unified level list: hand-crafted high-contrast art first, then emojis.
  function levels() {
    const art = (App.ART || []).map((a) => ({ kind: 'art', a, name: a.name, icon: a.icon }));
    const emoji = EMOJIS.map((e) => ({ kind: 'emoji', e: e.e, name: e.name, icon: e.e }));
    return art.concat(emoji);
  }
  const LEVELS = levels();

  function loadLevel(idx) {
    levelIdx = (idx % LEVELS.length + LEVELS.length) % LEVELS.length;
    const meta = LEVELS[levelIdx];
    const puzzle = meta.kind === 'art' ? meta.a.build() : buildPuzzle(meta.e);
    won = false;
    hideWin();

    game = new App.Game(puzzle);
    game.scramble();
    sel = null;

    if (!stage) {
      stage = new App.Stage($('stage'), game);
      stage.start();
    } else {
      stage.game = game;
      stage.clearSelection();
      stage.resize();
    }

    $('level-name').textContent = meta.name;
    $('level-emoji').textContent = meta.icon;
    drawThumb(puzzle);
    updateHUD();
  }

  function nextLevel() { loadLevel(levelIdx + 1); }

  // ---- input ----------------------------------------------------------------
  function bindInput(canvas) {
    let downX = 0, downY = 0, downT = 0, moved = false;
    const pt = (e) => {
      const r = canvas.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
      return { x: src.clientX - r.left, y: src.clientY - r.top };
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const p = pt(e); downX = p.x; downY = p.y; downT = stage.now(); moved = false;
      sfx.resume();
    }, { passive: false });
    canvas.addEventListener('pointermove', (e) => {
      const p = pt(e);
      if (Math.hypot(p.x - downX, p.y - downY) > 12) moved = true;
    }, { passive: false });
    canvas.addEventListener('pointerup', (e) => {
      e.preventDefault();
      if (moved || stage.now() - downT > 600) return;   // a drag/long-press, not a tap
      const p = pt(e);
      handleTap(p.x, p.y);
    }, { passive: false });
  }

  // ---- input: two-step select -> target -------------------------------------
  // First tap lifts a group of beads (rise). Second tap chooses where they go:
  // the tray, or a matching empty area on the picture.
  function handleTap(px, py) {
    if (won) return;
    const hit = stage.hitCell(px, py);
    const inTray = stage.hitTray(px, py);

    if (!sel) {
      if (hit) startBoardSelection(hit);
      else if (inTray) startTraySelection(px, py);
      return;
    }

    if (sel.src === 'board') {
      if (inTray) return commitBoardToTray();
      if (hit) {
        const c = game.cells[game.idx(hit.gx, hit.gy)];
        if (c.on && c.cur === null && !c.pending && c.target === sel.color) return commitBoardToHole(hit);
        if (c.on && c.cur !== null) {                       // tapped a bead
          if (sel.set.has(game.idx(hit.gx, hit.gy))) return deselect();  // same group → drop
          const clump = game.selectClump(hit.gx, hit.gy);
          if (clump) return setBoardSelection(clump);
          deselect(); stage.ring(hit.gx, hit.gy); sfx.tick(); return;     // locked
        }
      }
      return deselect();
    }

    if (sel.src === 'tray') {
      if (hit) {
        const c = game.cells[game.idx(hit.gx, hit.gy)];
        if (c.on && c.cur === null && !c.pending && c.target === sel.color) return commitTrayToHole(hit);
        return deselect();
      }
      if (inTray) {
        const bead = stage.hitTrayBead(px, py);
        if (bead && bead.ci !== sel.color) return setTraySelection(bead.ci);
        return deselect();                                  // same color / empty area
      }
      return deselect();
    }
  }

  function startBoardSelection(hit) {
    const clump = game.selectClump(hit.gx, hit.gy);
    if (clump) setBoardSelection(clump);
    else { stage.ring(hit.gx, hit.gy); sfx.tick(); }        // empty or locked
  }
  function setBoardSelection(clump) {
    sel = { src: 'board', color: clump.color, cells: clump.cells, set: new Set(clump.cells.map((c) => c.i)) };
    stage.setSelection(sel.cells.map((c) => c.i), null);
    stage.ring(clump.cells[0].gx, clump.cells[0].gy);
    sfx.lift();
  }
  function startTraySelection(px, py) {
    const bead = stage.hitTrayBead(px, py);
    if (bead) setTraySelection(bead.ci);
  }
  function setTraySelection(color) {
    const beads = game.tray.filter((b) => b.ci === color);
    if (!beads.length) return;
    sel = { src: 'tray', color, beads };
    stage.setSelection(null, beads);
    sfx.lift();
  }
  function deselect() { sel = null; stage.clearSelection(); }

  // ---- commits ---------------------------------------------------------------
  // Selected board beads → the tray (however many slots are free).
  function commitBoardToTray() {
    const free = game.trayFree();
    if (free <= 0) { stage.kick(7); sfx.reject(); return; } // keep selection, try a hole instead

    const tc = { x: stage.tray.x + stage.tray.w / 2, y: stage.tray.y };
    let ordered = sel.cells.map((c) => {
      const rc = stage.cellRect(c.gx, c.gy);
      return { c, rc, d: Math.hypot(rc.cx - tc.x, rc.cy - tc.y) };
    }).sort((a, b) => a.d - b.d);
    if (ordered.length > free) ordered = ordered.slice(0, free);

    const color = sel.color, base = game.bagTotal();
    const palCol = game.palette[color];
    sfx.scoop(ordered.length);
    ordered.forEach((o, k) => {
      game.liftCell(o.c.i);
      const slot = stage.slotCenter(base + k);
      stage.spawnFlyer({
        color: palCol, x0: o.rc.cx, y0: o.rc.cy, x1: slot.x, y1: slot.y,
        delay: k * 28, dur: 300 + Math.min(180, o.d), r0: stage.beadR, r1: stage.traySlotR, arc: -stage.cell * 1.1,
        onLand: () => { const b = game.trayPush(color); b.rx = slot.x; b.ry = slot.y; sfx.tick(); updateHUD(); },
      });
    });
    deselect(); updateHUD();
  }

  // Selected board beads → straight into a matching empty area (board → board).
  function commitBoardToHole(hit) {
    const hole = game.selectHole(hit.gx, hit.gy);
    if (!hole) return deselect();
    const tx = stage.cellRect(hit.gx, hit.gy).cx, ty = stage.cellRect(hit.gx, hit.gy).cy;
    const color = sel.color, palCol = game.palette[color];

    const src = sel.cells.map((c) => ({ c, rc: stage.cellRect(c.gx, c.gy) }))
      .sort((a, b) => Math.hypot(a.rc.cx - tx, a.rc.cy - ty) - Math.hypot(b.rc.cx - tx, b.rc.cy - ty));
    const dst = hole.cells.map((c) => ({ c, rc: stage.cellRect(c.gx, c.gy) }))
      .sort((a, b) => Math.hypot(a.rc.cx - tx, a.rc.cy - ty) - Math.hypot(b.rc.cx - tx, b.rc.cy - ty));
    const n = Math.min(src.length, dst.length);

    sfx.pour(n);
    let remaining = n;
    for (let k = 0; k < n; k++) {
      const s = src[k], d = dst[k];
      game.liftCell(s.c.i); game.reserve(d.c.i);
      stage.spawnFlyer({
        color: palCol, x0: s.rc.cx, y0: s.rc.cy, x1: d.rc.cx, y1: d.rc.cy,
        delay: k * 30, dur: 300 + Math.min(180, Math.hypot(d.rc.cx - s.rc.cx, d.rc.cy - s.rc.cy)),
        arc: -stage.cell * 1.1,
        onLand: () => {
          game.fillCell(d.c.i, color);
          stage.burst(d.rc.cx, d.rc.cy, palCol, 5);
          stage.ring(d.c.gx, d.c.gy);
          sfx.plink(); updateHUD();
          if (--remaining === 0) checkWin();
        },
      });
    }
    deselect(); updateHUD();
  }

  // Selected tray beads → a matching empty area (however many fit).
  function commitTrayToHole(hit) {
    const hole = game.selectHole(hit.gx, hit.gy);
    if (!hole) return deselect();
    const color = sel.color, palCol = game.palette[color];
    const tx = stage.cellRect(hit.gx, hit.gy).cx, ty = stage.cellRect(hit.gx, hit.gy).cy;

    const targets = hole.cells.map((c) => ({ c, rc: stage.cellRect(c.gx, c.gy) }))
      .sort((a, b) => Math.hypot(a.rc.cx - tx, a.rc.cy - ty) - Math.hypot(b.rc.cx - tx, b.rc.cy - ty));
    const n = Math.min(game.bagCount(color), targets.length);
    const removed = game.trayRemove(color, n);

    sfx.pour(n);
    let remaining = n;
    for (let k = 0; k < n; k++) {
      const o = targets[k], srcB = removed[k];
      const sx = (srcB && srcB.rx != null) ? srcB.rx : stage.tray.x + stage.tray.w / 2;
      const sy = (srcB && srcB.ry != null) ? srcB.ry : stage.tray.y + stage.tray.h / 2;
      game.reserve(o.c.i);
      stage.spawnFlyer({
        color: palCol, x0: sx, y0: sy, x1: o.rc.cx, y1: o.rc.cy,
        delay: k * 34, dur: 320 + Math.min(160, Math.hypot(o.rc.cx - sx, o.rc.cy - sy)),
        r0: stage.traySlotR, r1: stage.beadR, arc: -stage.cell * 1.0,
        onLand: () => {
          game.fillCell(o.c.i, color);
          stage.burst(o.rc.cx, o.rc.cy, palCol, 5);
          stage.ring(o.c.gx, o.c.gy);
          sfx.plink(); updateHUD();
          if (--remaining === 0) checkWin();
        },
      });
    }
    deselect(); updateHUD();
  }

  function checkWin() {
    if (won) return;
    if (game.isWon()) {
      won = true;
      stage.celebrate();
      stage.kick(10);
      sfx.win();
      setTimeout(showWin, 650);
    }
  }

  // ---- HUD ------------------------------------------------------------------
  function updateHUD() {
    const pct = Math.round(game.progress() * 100);
    $('progress-fill').style.width = pct + '%';
    $('progress-pct').textContent = pct + '%';
  }

  function drawThumb(puzzle) {
    const cv = $('target-thumb');
    const ctx = cv.getContext('2d');
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssSize = 44;
    cv.width = cssSize * dpr; cv.height = cssSize * dpr;
    cv.style.width = cv.style.height = cssSize + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssSize, cssSize);
    const cell = cssSize / puzzle.size;
    for (const c of puzzle.cells) {
      if (!c.on) continue;
      ctx.fillStyle = App.color.rgbCss(puzzle.palette[c.ci]);
      ctx.fillRect(c.gx * cell, c.gy * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }

  function showWin() {
    $('win-emoji').textContent = LEVELS[levelIdx].icon;
    $('win-name').textContent = LEVELS[levelIdx].name;
    $('win-overlay').classList.add('show');
  }
  function hideWin() { $('win-overlay').classList.remove('show'); }

  window.addEventListener('DOMContentLoaded', () => {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(init);
    else init();
  });

  App.game = () => game;   // handy for console debugging
  App.stage = () => stage;
})(window.App = window.App || {});
