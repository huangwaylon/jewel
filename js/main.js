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

  function loadLevel(idx) {
    levelIdx = (idx % EMOJIS.length + EMOJIS.length) % EMOJIS.length;
    const meta = EMOJIS[levelIdx];
    const puzzle = buildPuzzle(meta.e);
    won = false;
    hideWin();

    game = new App.Game(puzzle);
    game.scramble();

    if (!stage) {
      stage = new App.Stage($('stage'), game);
      stage.start();
    } else {
      stage.game = game;
      stage.resize();
    }

    $('level-name').textContent = meta.name;
    $('level-emoji').textContent = meta.e;
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

  function handleTap(px, py) {
    if (won) return;
    const hit = stage.hitCell(px, py);
    if (!hit) return;
    const { gx, gy } = hit;
    const cell = game.cells[game.idx(gx, gy)];
    if (!cell.on) return;

    if (cell.cur !== null) {
      const clump = game.selectClump(gx, gy);
      if (clump && clump.cells.length) collect(clump, px, py);
      else { stage.ring(gx, gy); sfx.tick(); }   // locked bead — gentle ack
    } else {
      const hole = game.selectHole(gx, gy);
      if (hole && game.bagCount(hole.target) > 0) {
        place(hole, gx, gy);
      } else {
        // nothing matching to pour here
        stage.kick(7); sfx.reject();
        stage.ring(gx, gy);
      }
    }
  }

  // ---- collect: beads fly from board into the tray --------------------------
  function collect(clump, tapX, tapY) {
    const col = game.palette[clump.color];
    const pile = stage.pilePos(clump.color);
    // ripple out from the tapped point
    const ordered = clump.cells.map((c) => {
      const rc = stage.cellRect(c.gx, c.gy);
      return { c, rc, d: Math.hypot(rc.cx - tapX, rc.cy - tapY) };
    }).sort((a, b) => a.d - b.d);

    stage.ring(clump.cells[0].gx, clump.cells[0].gy);
    sfx.scoop(ordered.length);

    ordered.forEach((o, k) => {
      game.liftCell(o.c.i);                     // board shows empty immediately
      stage.spawnFlyer({
        color: col,
        x0: o.rc.cx, y0: o.rc.cy,
        x1: pile.x + (Math.random() - 0.5) * 10, y1: pile.y - 4,
        delay: k * 28, dur: 300 + Math.min(180, o.d),
        r0: stage.beadR, r1: Math.min(stage.beadR, 13),
        arc: -stage.cell * 1.1,
        onLand: () => { game.bagAdd(clump.color, 1); sfx.tick(); updateHUD(); },
      });
    });
    updateHUD();
  }

  // ---- place: beads pour from the tray into matching empty cells ------------
  function place(hole, gx, gy) {
    const col = game.palette[hole.target];
    const pile = stage.pilePos(hole.target);
    const avail = game.bagCount(hole.target);
    // nearest empty cells to the tap, up to what we hold
    const tx = stage.cellRect(gx, gy).cx, ty = stage.cellRect(gx, gy).cy;
    const targets = hole.cells.map((c) => {
      const rc = stage.cellRect(c.gx, c.gy);
      return { c, rc, d: Math.hypot(rc.cx - tx, rc.cy - ty) };
    }).sort((a, b) => a.d - b.d).slice(0, avail);

    const n = targets.length;
    game.bagTake(hole.target, n);
    targets.forEach((o) => game.reserve(o.c.i));
    sfx.pour(n);

    let remaining = n;
    targets.forEach((o, k) => {
      stage.spawnFlyer({
        color: col,
        x0: pile.x + (Math.random() - 0.5) * 10, y0: pile.y - 4,
        x1: o.rc.cx, y1: o.rc.cy,
        delay: k * 34, dur: 320 + Math.min(160, o.d),
        r0: Math.min(stage.beadR, 13), r1: stage.beadR,
        arc: -stage.cell * 1.0,
        onLand: () => {
          game.fillCell(o.c.i, hole.target);
          stage.burst(o.rc.cx, o.rc.cy, col, 5);
          stage.ring(o.c.gx, o.c.gy);
          sfx.plink();
          updateHUD();
          if (--remaining === 0) checkWin();
        },
      });
    });
    updateHUD();
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
    $('win-emoji').textContent = EMOJIS[levelIdx].e;
    $('win-name').textContent = EMOJIS[levelIdx].name;
    $('win-overlay').classList.add('show');
  }
  function hideWin() { $('win-overlay').classList.remove('show'); }

  window.addEventListener('DOMContentLoaded', () => {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(init);
    else init();
  });

  App.game = () => game;   // handy for console debugging
})(window.App = window.App || {});
