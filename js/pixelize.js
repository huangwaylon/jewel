/* pixelize.js — turn an emoji glyph OR a user photo into a small quantized
   pixel grid. Fully client-side: render/draw to a canvas, downsample to a grid,
   median-cut the cell colors into a tidy palette, and cap any single color so
   the scramble can leave no bead solved.
   Puzzle shape: { size, palette:[[r,g,b]...], cells:[{gx,gy,on,ci}] } */
(function (App) {
  'use strict';
  const C = App.color;
  const MAX_SHARE = 0.46;
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

  // ---- emoji → puzzle (few colors, high-contrast spread) -------------------
  function pixelize(emoji, opts) {
    opts = opts || {};
    const size = opts.size || 16, colors = opts.colors || 5, SS = 10, px = size * SS;
    const ctx = makeCanvas(px);
    const fontPx = Math.floor(px * 0.84);
    ctx.font = `${fontPx}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, px / 2, px / 2 + px * 0.04);

    const { raw, samples } = sampleGrid(ctx, px, size, SS, 0.45);
    if (!samples.length) return null;
    return quantize(size, raw, samples, { colors, expand: 2, mergeT: 46, contrast: 'spread' });
  }

  // ---- photo → puzzle (up to ~10 colors, keep the real look) ---------------
  function pixelizeImage(source, opts) {
    opts = opts || {};
    const size = opts.size || 16, colors = opts.colors || 10, SS = 8, px = size * SS;
    const ctx = makeCanvas(px);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // cover-crop the largest centered square of the source
    const sw = source.width, sh = source.height, side = Math.min(sw, sh);
    ctx.drawImage(source, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, px, px);

    const { raw, samples } = sampleGrid(ctx, px, size, SS, 0.45);
    if (!samples.length) return null;
    return quantize(size, raw, samples, { colors, expand: 0, mergeT: 18, contrast: 'natural' });
  }

  // ---- shared helpers -------------------------------------------------------
  function makeCanvas(px) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, px, px);
    return ctx;
  }

  // Average each grid cell (alpha-weighted); a cell is "on" if it has coverage.
  function sampleGrid(ctx, px, size, SS, alphaThresh) {
    const data = ctx.getImageData(0, 0, px, px).data;
    const raw = [], samples = [];
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
        if (cover > alphaThresh && a > 0) {
          raw.push({ gx, gy, on: true, color: [r / a, g / a, b / a] });
          samples.push(raw[raw.length - 1].color);
        } else {
          raw.push({ gx, gy, on: false });
        }
      }
    }
    return { raw, samples };
  }

  function quantize(size, raw, samples, opts) {
    const colors = opts.colors;
    let centers = C.medianCut(samples, colors + (opts.expand || 0));
    centers = C.mergeSimilar(centers, opts.mergeT * opts.mergeT);
    if (centers.length > colors) {
      const pop = centers.map(() => 0);
      for (const c of samples) pop[C.nearest(centers, c)]++;
      centers = centers.map((c, i) => ({ c, n: pop[i] })).sort((a, b) => b.n - a.n)
        .slice(0, colors).map((x) => x.c);
    }

    for (const cell of raw) if (cell.on) cell.ci = C.nearest(centers, cell.color);
    capDominance(raw.filter((c) => c.on), centers, MAX_SHARE, colors);

    const usedList = [...new Set(raw.filter((c) => c.on).map((c) => c.ci))];
    const usedColors = usedList.map((ci) => centers[ci]);
    const palette = opts.contrast === 'spread' ? C.contrastify(usedColors) : usedColors.map(C.jewelize);
    const remap = new Map();
    usedList.forEach((ci, k) => remap.set(ci, k));
    for (const cell of raw) if (cell.on) { cell.ci = remap.get(cell.ci); delete cell.color; }

    return { size, palette, cells: raw };
  }

  function recompCenter(centers, onCells, ci) {
    let r = 0, g = 0, b = 0, n = 0;
    for (const c of onCells) if (c.ci === ci) { r += c.color[0]; g += c.color[1]; b += c.color[2]; n++; }
    if (n > 0) centers[ci] = [r / n, g / n, b / n];
  }

  // Cap any single color to <= maxFrac of cells (so the scramble can leave no
  // bead on its target). Split a too-dominant color by brightness, then merge
  // the smallest pair back to stay within the color budget.
  function capDominance(onCells, centers, maxFrac, maxColors) {
    const total = onCells.length;
    for (let iter = 0; iter < 8; iter++) {
      const count = {};
      for (const c of onCells) count[c.ci] = (count[c.ci] || 0) + 1;
      let dom = -1, domN = 0;
      for (const k in count) if (count[k] > domN) { domN = count[k]; dom = +k; }
      if (domN <= maxFrac * total) break;

      const grp = onCells.filter((c) => c.ci === dom).sort((a, b) => lum(a.color) - lum(b.color));
      const ni = centers.length; centers.push([0, 0, 0]);
      for (let x = grp.length >> 1; x < grp.length; x++) grp[x].ci = ni;
      recompCenter(centers, onCells, dom);
      recompCenter(centers, onCells, ni);

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
        if (bi < 0) { bi = fbi; bj = fbj; }
        for (const c of onCells) if (c.ci === bj) c.ci = bi;
        recompCenter(centers, onCells, bi);
        usedKeys = [...new Set(onCells.map((c) => c.ci))];
      }
    }
  }

  App.pixelize = pixelize;
  App.pixelizeImage = pixelizeImage;
})(window.App = window.App || {});
