/* art.js — hand-crafted, high-contrast pixel-art puzzles.
   Unlike the emoji pixelizer (one dominant body color, subtle shading), these
   use a deliberately vivid palette of very different colors and balanced color
   regions, so no color exceeds ~46% of the cells — which lets the scramble
   leave NO bead in its solved spot. Each builder returns the standard puzzle
   shape: { size, palette:[[r,g,b]...], cells:[{gx,gy,on,ci}] }. */
(function (App) {
  'use strict';

  // Vivid, maximally-distinct palette.
  const P = {
    R: [230, 41, 55], O: [245, 135, 30], Y: [250, 208, 48], G: [55, 188, 70],
    B: [30, 110, 235], C: [0, 196, 238], P: [150, 80, 230], M: [255, 92, 160],
    W: [245, 248, 250], K: [26, 26, 40], N: [150, 95, 55], T: [18, 170, 155],
  };

  // Build a puzzle from f(gx,gy) -> palette key (e.g. 'R') or null for empty.
  function build(size, f) {
    const order = [], map = {}, cells = [];
    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < size; gx++) {
        const k = f(gx, gy);
        if (k == null) { cells.push({ gx, gy, on: false }); continue; }
        if (!(k in map)) { map[k] = order.length; order.push(k); }
        cells.push({ gx, gy, on: true, ci: map[k] });
      }
    }
    return { size, palette: order.map((k) => P[k]), cells };
  }

  // Build from ASCII rows (square); '.'/' ' = empty.
  function fromRows(rows) {
    const size = rows.length;
    return build(size, (gx, gy) => {
      const ch = rows[gy][gx];
      return (ch === '.' || ch === ' ' || ch === undefined) ? null : ch;
    });
  }

  // ---- generated designs (balanced by construction) ------------------------
  function beachBall() {                       // 4 wedges + white hub, in a disc
    const size = 16, c = (size - 1) / 2, R = 7.4, w = ['R', 'Y', 'G', 'B'];
    return build(size, (gx, gy) => {
      const dx = gx - c, dy = gy - c, d = Math.hypot(dx, dy);
      if (d > R) return null;
      if (d < R * 0.24) return 'W';
      const a = Math.atan2(dy, dx) + Math.PI;
      return w[Math.floor(a / (Math.PI / 2)) % 4];
    });
  }

  function bullseye() {                         // equal-area concentric rings
    const size = 16, c = (size - 1) / 2, R = 7.6, cols = ['R', 'W', 'B', 'Y', 'K'];
    return build(size, (gx, gy) => {
      const d = Math.hypot(gx - c, gy - c);
      if (d > R) return null;
      return cols[Math.min(4, Math.floor((d * d) / (R * R) * 5))];
    });
  }

  function balloon() {                          // vertical stripes + basket
    const size = 16, cx = 7.5, cy = 6.2, R = 6.3, stripes = ['R', 'Y', 'G', 'B'];
    return build(size, (gx, gy) => {
      const dx = gx - cx, dy = gy - cy, d = Math.hypot(dx, dy);
      if (d <= R) {
        const s = Math.max(0, Math.min(3, Math.floor((dx + R) / (2 * R / 4))));
        return stripes[s];
      }
      if (gy >= 13 && gy <= 15 && gx >= 6 && gx <= 9) return 'N';        // basket
      if (gy >= 12 && gy < 13 && (gx === 6 || gx === 9)) return 'N';     // ropes
      return null;
    });
  }

  function rainbow() {                          // five arcs
    const size = 16, cx = 7.5, cy = 14, bands = ['R', 'O', 'Y', 'G', 'B'];
    return build(size, (gx, gy) => {
      const dx = gx - cx, dy = gy - cy, d = Math.hypot(dx, dy);
      if (dy > 0 || d < 6.2 || d > 11.2) return null;
      return bands[Math.max(0, Math.min(4, Math.floor((11.2 - d) / (5 / 5))))];
    });
  }

  function flower() {                           // alternating petals + center
    const size = 16, c = 7.5, pcy = 6.0;
    return build(size, (gx, gy) => {
      const dx = gx - c, dy = gy - pcy, d = Math.hypot(dx, dy);
      if (d < 2.0) return 'Y';                                   // center
      if (d >= 2.0 && d <= 5.0) {                                // petals
        const a = Math.atan2(dy, dx) + Math.PI;
        return (Math.floor(a / (Math.PI / 3)) % 2) ? 'O' : 'P';
      }
      if (gx >= 7 && gx <= 8 && gy >= 10 && gy <= 15) return 'G';        // stem
      if (gy >= 12 && gy <= 13 && (gx >= 4 && gx <= 6 || gx >= 9 && gx <= 11)) return 'G'; // leaves
      return null;
    });
  }

  // ---- hand-drawn sprites ---------------------------------------------------
  const DIAMOND = [
    '................',
    '...WWCCCCCCWW...',
    '..WCCBBBBBBCCW..',
    '.CCBBPPPPPPBBCC.',
    'CCBBPPPPPPPPBBCC',
    '.CBBPPMMMMPPBBC.',
    '..BPPMMWWMMPPB..',
    '...BPMMWWMMPB...',
    '....BPMMMMPB....',
    '.....BPMMPB.....',
    '......BPPB......',
    '.......BB.......',
    '................',
    '................',
    '................',
    '................',
  ];

  const MUSHROOM = [
    '................',
    '....KKKKKKKK....',
    '..KKRRRRRRRRKK..',
    '.KRRWWRRRRWWRRK.',
    '.KRRWWRRRRWWRRK.',
    'KRRRRRRRRRRRRRRK',
    'KRRRRWWWWWWRRRRK',
    'KRRRRWWWWWWRRRRK',
    '.KRRRRRRRRRRRRK.',
    '..KKKKKKKKKKKK..',
    '...NNNNNNNNNN...',
    '...NNKNNNNKNNN..',
    '...NNNNNNNNNN...',
    '....NNNNNNNN....',
    '.....NNNNNN.....',
    '................',
  ];

  const ART = [
    { name: 'Beach Ball', icon: '🏐', build: beachBall },
    { name: 'Bullseye', icon: '🎯', build: bullseye },
    { name: 'Diamond', icon: '💎', build: () => fromRows(DIAMOND) },
    { name: 'Hot Balloon', icon: '🎈', build: balloon },
    { name: 'Rainbow Arc', icon: '🌈', build: rainbow },
    { name: 'Bloom', icon: '🌼', build: flower },
    { name: 'Toadstool', icon: '🍄', build: () => fromRows(MUSHROOM) },
  ];

  App.ART = ART;
})(window.App = window.App || {});
