/* pixelize.js — turn an emoji glyph into a small quantized pixel grid.
   Fully client-side: render the emoji to a canvas, downsample to a grid,
   then median-cut the cell colors into a tidy palette. */
(function (App) {
  'use strict';
  const C = App.color;

  // Render `emoji` and return { size, palette:[[r,g,b]...], cells:[{gx,gy,on,ci}] }
  function pixelize(emoji, opts) {
    opts = opts || {};
    const size = opts.size || 16;       // grid is size x size
    const colors = opts.colors || 5;    // target palette count (<= 5)
    const SS = 10;                      // supersample pixels per cell
    const px = size * SS;

    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, px, px);

    // Draw the emoji as large as possible, centered.
    const fontPx = Math.floor(px * 0.84);
    ctx.font = `${fontPx}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, px / 2, px / 2 + px * 0.04);

    const data = ctx.getImageData(0, 0, px, px).data;

    // Average each grid cell (alpha-weighted), decide on/off by coverage.
    const raw = [];
    const samples = [];
    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < size; gx++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const x = gx * SS + sx, y = gy * SS + sy, i = (y * px + x) * 4;
            const al = data[i + 3] / 255;
            r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al;
          }
        }
        const cover = a / (SS * SS);
        if (cover > 0.45 && a > 0) {
          const col = [r / a, g / a, b / a];
          raw.push({ gx, gy, on: true, color: col });
          samples.push(col);
        } else {
          raw.push({ gx, gy, on: false });
        }
      }
    }

    if (samples.length === 0) return null;

    // Cluster the cell colors, then merge near-identical shades so we spend our
    // (<=5) color slots on genuinely different colors rather than 5 reds.
    let centers = C.medianCut(samples, colors + 2);
    centers = C.mergeSimilar(centers, 46 * 46);   // collapse within ~46/channel
    if (centers.length > colors) {
      // keep the `colors` most populous clusters
      const pop = centers.map(() => 0);
      for (const c of samples) pop[C.nearest(centers, c)]++;
      centers = centers
        .map((c, i) => ({ c, n: pop[i] }))
        .sort((a, b) => b.n - a.n)
        .slice(0, colors)
        .map((x) => x.c);
    }

    // Assign each cell to its nearest ORIGINAL center (keep cell.color around
    // for the dominance step below).
    for (const cell of raw) if (cell.on) cell.ci = C.nearest(centers, cell.color);

    // Cap any single color to <= MAX_SHARE of the cells, so the scramble can
    // leave NO bead on its target cell. Split a too-dominant color in two by
    // brightness, then merge the smallest pair back down to stay within budget.
    capDominance(raw.filter((c) => c.on), centers, MAX_SHARE, colors);

    // Build a high-contrast display palette from just the colors actually used.
    const usedList = [...new Set(raw.filter((c) => c.on).map((c) => c.ci))];
    const contrast = C.contrastify(usedList.map((ci) => centers[ci]));
    const remap = new Map();
    usedList.forEach((ci, k) => remap.set(ci, k));
    for (const cell of raw) if (cell.on) { cell.ci = remap.get(cell.ci); delete cell.color; }

    return { size, palette: contrast, cells: raw };
  }

  const MAX_SHARE = 0.46;
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

  function recompCenter(centers, onCells, ci) {
    let r = 0, g = 0, b = 0, n = 0;
    for (const c of onCells) if (c.ci === ci) { r += c.color[0]; g += c.color[1]; b += c.color[2]; n++; }
    if (n > 0) centers[ci] = [r / n, g / n, b / n];
  }

  function capDominance(onCells, centers, maxFrac, maxColors) {
    const total = onCells.length;
    for (let iter = 0; iter < 6; iter++) {
      const count = {};
      for (const c of onCells) count[c.ci] = (count[c.ci] || 0) + 1;
      let dom = -1, domN = 0;
      for (const k in count) if (count[k] > domN) { domN = count[k]; dom = +k; }
      if (domN <= maxFrac * total) break;

      // split the dominant cluster in half by brightness
      const grp = onCells.filter((c) => c.ci === dom).sort((a, b) => lum(a.color) - lum(b.color));
      const ni = centers.length; centers.push([0, 0, 0]);
      for (let x = grp.length >> 1; x < grp.length; x++) grp[x].ci = ni;
      recompCenter(centers, onCells, dom);
      recompCenter(centers, onCells, ni);

      // merge smallest pairs to stay within the color budget
      let usedKeys = [...new Set(onCells.map((c) => c.ci))];
      while (usedKeys.length > maxColors) {
        const cnt = {};
        for (const c of onCells) cnt[c.ci] = (cnt[c.ci] || 0) + 1;
        let bi = -1, bj = -1, best = Infinity, fbi = -1, fbj = -1, fbest = Infinity;
        for (let a = 0; a < usedKeys.length; a++) for (let b = a + 1; b < usedKeys.length; b++) {
          const ka = usedKeys[a], kb = usedKeys[b], comb = cnt[ka] + cnt[kb];
          if (comb < fbest) { fbest = comb; fbi = ka; fbj = kb; }
          if (comb <= maxFrac * total && comb < best) { best = comb; bi = ka; bj = kb; }
        }
        if (bi < 0) { bi = fbi; bj = fbj; }       // fallback if none stays under cap
        for (const c of onCells) if (c.ci === bj) c.ci = bi;
        recompCenter(centers, onCells, bi);
        usedKeys = [...new Set(onCells.map((c) => c.ci))];
      }
    }
  }

  App.pixelize = pixelize;
})(window.App = window.App || {});
