/* color.js — palette quantization (median cut) + color helpers.
   Kept dependency-free so it runs anywhere (Safari PWA, GitHub Pages). */
(function (App) {
  'use strict';

  // ---- basic conversions ---------------------------------------------------
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    const d = max - min;
    if (d > 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  function rgbCss(c) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function dist2(a, b) {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  }

  // ---- median cut quantization ---------------------------------------------
  // points: array of [r,g,b]. Returns an array of <=k representative colors.
  function medianCut(points, k) {
    if (points.length === 0) return [[200, 200, 200]];
    let boxes = [points.slice()];
    while (boxes.length < k) {
      // pick the box with the largest channel range to split
      let bi = -1, bestRange = -1, bestCh = 0;
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        if (box.length < 2) continue;
        const r = channelRanges(box);
        const ch = r.maxCh, range = r.max;
        if (range > bestRange) { bestRange = range; bi = i; bestCh = ch; }
      }
      if (bi < 0) break;
      const box = boxes[bi];
      box.sort((a, b) => a[bestCh] - b[bestCh]);
      const mid = box.length >> 1;
      boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
    }
    return boxes.map(averageColor);
  }
  function channelRanges(box) {
    const mn = [255, 255, 255], mx = [0, 0, 0];
    for (const p of box) for (let c = 0; c < 3; c++) {
      if (p[c] < mn[c]) mn[c] = p[c];
      if (p[c] > mx[c]) mx[c] = p[c];
    }
    let maxCh = 0, max = -1;
    for (let c = 0; c < 3; c++) {
      // weight green a touch more (perceptual), red, then blue
      const w = c === 1 ? 1.2 : c === 0 ? 1.0 : 0.9;
      const range = (mx[c] - mn[c]) * w;
      if (range > max) { max = range; maxCh = c; }
    }
    return { maxCh, max };
  }
  function averageColor(box) {
    let r = 0, g = 0, b = 0;
    for (const p of box) { r += p[0]; g += p[1]; b += p[2]; }
    const n = box.length || 1;
    return [r / n, g / n, b / n];
  }

  // Merge palette entries that are perceptually near-identical.
  function mergeSimilar(palette, threshold) {
    const out = [];
    for (const c of palette) {
      let merged = false;
      for (const o of out) {
        if (dist2(c, o) < threshold) { merged = true; break; }
      }
      if (!merged) out.push(c);
    }
    return out;
  }

  function nearest(palette, c) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const d = dist2(palette[i], c);
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  }

  // Give the palette a clean "jewel" pop: nudge saturation/lightness so beads
  // read as glossy candy rather than muddy averages.
  function jewelize(c) {
    let [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
    s = Math.min(1, s * 1.18 + 0.05);
    l = Math.min(0.82, Math.max(0.30, l * 0.96 + 0.04));
    return hslToRgb(h, s, l);
  }

  // Pull a palette apart so every bead is easy to tell from every other one.
  // Emoji are often one hue with subtle shading (a strawberry is ~5 reds); we
  // rank the colors by brightness and spread them across a wide lightness band,
  // crank saturation, and nudge near-identical hues apart. The result reads as
  // distinct candy beads even when the source colors were nearly the same.
  function contrastify(palette) {
    const n = palette.length;
    if (n <= 1) {
      const c = palette[0] || [200, 120, 160];
      let [h, s] = rgbToHsl(c[0], c[1], c[2]);
      return [hslToRgb(h, Math.min(1, s * 1.4 + 0.3), 0.6)];
    }
    const hsl = palette.map((c) => rgbToHsl(c[0], c[1], c[2]));
    const order = hsl.map((h, i) => [h[2], i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const LO = 0.34, HI = 0.78;
    const out = palette.slice();
    order.forEach((idx, k) => {
      let [h, s] = hsl[idx];
      const l = LO + (HI - LO) * (k / (n - 1));        // even brightness steps
      s = Math.min(1, s * 1.5 + 0.30);                  // vivid
      out[idx] = hslToRgb(h, s, l);
    });
    return out;
  }

  // Punch up a palette derived from a real photo: keep each hue (so it still
  // reads as the photo) but crank saturation and spread the colors' lightness
  // apart around the palette mean, plus a mild global contrast curve. The
  // result has much stronger contrast and more variation between beads.
  function punchPalette(palette) {
    const hsl = palette.map((c) => rgbToHsl(c[0], c[1], c[2]));
    const meanL = hsl.reduce((s, h) => s + h[2], 0) / (hsl.length || 1);
    return palette.map((c, i) => {
      let [h, s, l] = hsl[i];
      s = Math.min(1, s * 1.55 + 0.14);             // vivid
      l = meanL + (l - meanL) * 1.55;               // spread beads apart in lightness
      l = 0.5 + (l - 0.5) * 1.15;                   // mild global contrast
      l = Math.max(0.07, Math.min(0.95, l));
      return hslToRgb(h, s, l);
    });
  }

  App.color = {
    rgbToHsl, hslToRgb, rgbCss, mix, dist2,
    medianCut, mergeSimilar, nearest, jewelize, contrastify, punchPalette, averageColor,
  };
})(window.App = window.App || {});
