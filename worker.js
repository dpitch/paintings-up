// worker.js — Runs heavy lightmap computation off the main thread

// ── LAB color space (duplicated here because workers can't access main thread) ──

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgbToXyz(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  return {
    x: 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb,
    y: 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb,
    z: 0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb,
  };
}

const D65 = { x: 0.95047, y: 1.0, z: 1.08883 };

function labF(t) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function xyzToLab(x, y, z) {
  const fx = labF(x / D65.x);
  const fy = labF(y / D65.y);
  const fz = labF(z / D65.z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function rgbToLab(r, g, b) {
  const xyz = rgbToXyz(r, g, b);
  return xyzToLab(xyz.x, xyz.y, xyz.z);
}

// ── sampleBorders ──

function sampleBorders(data, w, h, bandWidth, segments) {
  const bw = Math.max(2, Math.round(w * bandWidth));
  const bh = Math.max(2, Math.round(h * bandWidth));
  const points = [];

  function avgLab(x0, y0, x1, y1) {
    let sumL = 0, sumA = 0, sumB = 0, count = 0;
    const rx0 = Math.max(0, Math.round(x0));
    const ry0 = Math.max(0, Math.round(y0));
    const rx1 = Math.min(w - 1, Math.round(x1));
    const ry1 = Math.min(h - 1, Math.round(y1));
    for (let y = ry0; y <= ry1; y++) {
      for (let x = rx0; x <= rx1; x++) {
        const idx = (y * w + x) * 4;
        const lab = rgbToLab(data[idx], data[idx + 1], data[idx + 2]);
        sumL += lab.L; sumA += lab.a; sumB += lab.b; count++;
      }
    }
    return count > 0 ? { L: sumL / count, a: sumA / count, b: sumB / count } : { L: 100, a: 0, b: 0 };
  }

  // Top
  for (let i = 0; i < segments; i++) {
    const x0 = (i / segments) * w, x1 = ((i + 1) / segments) * w - 1;
    const lab = avgLab(x0, 0, x1, bh - 1);
    points.push({ x: (x0 + x1) / 2 / w, y: bh / 2 / h, ...lab, side: 'top' });
  }
  // Bottom
  for (let i = 0; i < segments; i++) {
    const x0 = (i / segments) * w, x1 = ((i + 1) / segments) * w - 1;
    const lab = avgLab(x0, h - bh, x1, h - 1);
    points.push({ x: (x0 + x1) / 2 / w, y: (h - bh / 2) / h, ...lab, side: 'bottom' });
  }
  // Left
  for (let i = 0; i < segments; i++) {
    const y0 = (i / segments) * h, y1 = ((i + 1) / segments) * h - 1;
    const lab = avgLab(0, y0, bw - 1, y1);
    points.push({ x: bw / 2 / w, y: (y0 + y1) / 2 / h, ...lab, side: 'left' });
  }
  // Right
  for (let i = 0; i < segments; i++) {
    const y0 = (i / segments) * h, y1 = ((i + 1) / segments) * h - 1;
    const lab = avgLab(w - bw, y0, w - 1, y1);
    points.push({ x: (w - bw / 2) / w, y: (y0 + y1) / 2 / h, ...lab, side: 'right' });
  }

  return points;
}

// ── buildLightmap ──

function buildLightmap(points, w, h) {
  const size = w * h;
  const mapL = new Float32Array(size);
  const mapA = new Float32Array(size);
  const mapB = new Float32Array(size);

  const sides = { top: [], bottom: [], left: [], right: [] };
  for (const p of points) sides[p.side].push(p);
  sides.top.sort((a, b) => a.x - b.x);
  sides.bottom.sort((a, b) => a.x - b.x);
  sides.left.sort((a, b) => a.y - b.y);
  sides.right.sort((a, b) => a.y - b.y);

  function interpSide(arr, t, coord) {
    if (arr.length === 0) return { L: 100, a: 0, b: 0 };
    if (arr.length === 1) return arr[0];
    if (t <= arr[0][coord]) return arr[0];
    if (t >= arr[arr.length - 1][coord]) return arr[arr.length - 1];
    for (let i = 0; i < arr.length - 1; i++) {
      if (t >= arr[i][coord] && t <= arr[i + 1][coord]) {
        const range = arr[i + 1][coord] - arr[i][coord];
        const frac = range > 0 ? (t - arr[i][coord]) / range : 0;
        return {
          L: arr[i].L + (arr[i + 1].L - arr[i].L) * frac,
          a: arr[i].a + (arr[i + 1].a - arr[i].a) * frac,
          b: arr[i].b + (arr[i + 1].b - arr[i].b) * frac,
        };
      }
    }
    return arr[arr.length - 1];
  }

  for (let py = 0; py < h; py++) {
    const ny = py / (h - 1);
    const fromLeft = interpSide(sides.left, ny, 'y');
    const fromRight = interpSide(sides.right, ny, 'y');

    for (let px = 0; px < w; px++) {
      const nx = px / (w - 1);
      const i = py * w + px;
      const fromTop = interpSide(sides.top, nx, 'x');
      const fromBottom = interpSide(sides.bottom, nx, 'x');

      const eps = 0.001;
      const wTop = 1 / (ny + eps);
      const wBottom = 1 / (1 - ny + eps);
      const wLeft = 1 / (nx + eps);
      const wRight = 1 / (1 - nx + eps);
      const wSum = wTop + wBottom + wLeft + wRight;

      mapL[i] = (fromTop.L * wTop + fromBottom.L * wBottom + fromLeft.L * wLeft + fromRight.L * wRight) / wSum;
      mapA[i] = (fromTop.a * wTop + fromBottom.a * wBottom + fromLeft.a * wLeft + fromRight.a * wRight) / wSum;
      mapB[i] = (fromTop.b * wTop + fromBottom.b * wBottom + fromLeft.b * wLeft + fromRight.b * wRight) / wSum;
    }
  }

  return { L: mapL, a: mapA, b: mapB };
}

// ── Message handler ──

self.onmessage = function(e) {
  const { pixelData, w, h, bandWidth, segments } = e.data;

  self.postMessage({ type: 'step', step: 'sampling' });
  const points = sampleBorders(pixelData, w, h, bandWidth || 0.03, segments || 20);

  self.postMessage({ type: 'step', step: 'lightmap' });
  const lightmap = buildLightmap(points, w, h);

  // Transfer the Float32Arrays for zero-copy
  self.postMessage(
    { type: 'done', points, lightmapL: lightmap.L, lightmapA: lightmap.a, lightmapB: lightmap.b },
    [lightmap.L.buffer, lightmap.a.buffer, lightmap.b.buffer]
  );
};
