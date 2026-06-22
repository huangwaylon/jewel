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

    // Assign each cell to its nearest ORIGINAL center, then build a
    // high-contrast display palette (same index order) for the beads.
    for (const cell of raw) {
      if (cell.on) { cell.ci = C.nearest(centers, cell.color); delete cell.color; }
    }
    const palette = C.contrastify(centers);

    // Drop any palette colors that ended up unused, and reindex.
    const used = new Set(raw.filter(c => c.on).map(c => c.ci));
    const remap = new Map();
    const finalPalette = [];
    for (let i = 0; i < palette.length; i++) {
      if (used.has(i)) { remap.set(i, finalPalette.length); finalPalette.push(palette[i]); }
    }
    for (const cell of raw) if (cell.on) cell.ci = remap.get(cell.ci);

    return { size, palette: finalPalette, cells: raw };
  }

  App.pixelize = pixelize;
})(window.App = window.App || {});
