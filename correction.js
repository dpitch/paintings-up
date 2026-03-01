// correction.js — Lightmap-based correction with multiple blending techniques

// ═══════════════════════════════════════════════════════════════
// Correction mode registry
// ═══════════════════════════════════════════════════════════════

const CORRECTION_MODES = [
  { id: 'lab-divide',  name: 'LAB Divide',    desc: 'Perceptual luminosity correction in LAB space' },
  { id: 'rgb-divide',  name: 'RGB Divide',    desc: 'Direct per-channel divide — fast, neutral' },
  { id: 'additive',    name: 'Linear Light',  desc: 'Simple additive offset' },
  { id: 'levels',      name: 'Levels',        desc: 'Remap white point per channel' },
];

// ═══════════════════════════════════════════════════════════════
// Highlight protection options
// ═══════════════════════════════════════════════════════════════

const HIGHLIGHT_OPTIONS = [
  { id: 'soft-shoulder', name: 'Soft Shoulder',       desc: 'Filmic rolloff — compresses highlights instead of clipping' },
  { id: 'highlight-guard', name: 'Highlight Guard',   desc: 'Eases off correction on bright pixels to preserve detail' },
];

// ═══════════════════════════════════════════════════════════════
// LAB color space utilities
// ═══════════════════════════════════════════════════════════════

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
  c = Math.max(0, Math.min(1, c));
  return c <= 0.0031308
    ? Math.round(c * 12.92 * 255)
    : Math.round((1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
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

function xyzToRgb(x, y, z) {
  const lr =  3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const lg = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
  const lb =  0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return { r: linearToSrgb(lr), g: linearToSrgb(lg), b: linearToSrgb(lb) };
}

const D65 = { x: 0.95047, y: 1.0, z: 1.08883 };

function labF(t) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function labFInv(t) {
  return t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787;
}

function xyzToLab(x, y, z) {
  const fx = labF(x / D65.x);
  const fy = labF(y / D65.y);
  const fz = labF(z / D65.z);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function labToXyz(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  return {
    x: D65.x * labFInv(fx),
    y: D65.y * labFInv(fy),
    z: D65.z * labFInv(fz),
  };
}

function rgbToLab(r, g, b) {
  const xyz = rgbToXyz(r, g, b);
  return xyzToLab(xyz.x, xyz.y, xyz.z);
}

function labToRgb(L, a, b) {
  const xyz = labToXyz(L, a, b);
  return xyzToRgb(xyz.x, xyz.y, xyz.z);
}

// ═══════════════════════════════════════════════════════════════
// Highlight protection post-processing
// ═══════════════════════════════════════════════════════════════

// Option 1: Soft Shoulder — filmic tone-map that compresses values > threshold
// instead of hard clipping. Preserves relative differences in highlights.
function applySoftShoulder(outData, pixelCount) {
  const dst = outData.data;
  const knee = 0.82;  // start compressing here
  const maxOut = 1.0;
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    for (let c = 0; c < 3; c++) {
      let v = dst[idx + c] / 255;
      if (v > knee) {
        // Smooth compression: maps [knee, inf) → [knee, maxOut) asymptotically
        const excess = v - knee;
        const range = maxOut - knee;
        v = knee + range * (1 - Math.exp(-excess / range));
      }
      dst[idx + c] = Math.round(Math.max(0, Math.min(255, v * 255)));
    }
  }
}

// Option 2: Highlight Guard — reduce correction strength on already-bright pixels.
// Applied during correction: blends corrected toward original proportional to brightness.
function applyHighlightGuard(outData, srcData, pixelCount) {
  const dst = outData.data;
  const src = srcData.data;
  const onset = 0.55;   // start protecting above this brightness (0–1)
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    // Original pixel luminance (fast approx)
    const lum = (src[idx] * 0.299 + src[idx + 1] * 0.587 + src[idx + 2] * 0.114) / 255;
    if (lum > onset) {
      // t ramps 0→1 as lum goes onset→1
      const t = Math.min(1, (lum - onset) / (1 - onset));
      // Smooth ease-in curve
      const blend = t * t;
      for (let c = 0; c < 3; c++) {
        dst[idx + c] = Math.round(dst[idx + c] + (src[idx + c] - dst[idx + c]) * blend);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Per-mode correction functions
// ═══════════════════════════════════════════════════════════════

function correctLabDivide(src, dst, lightmapL, lightmapA, lightmapB, intensity, pixelCount) {
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = src[idx], g = src[idx + 1], b = src[idx + 2], a = src[idx + 3];
    const lab = rgbToLab(r, g, b);

    const lmL = lightmapL[i];
    if (lmL > 0) {
      const correctedL = lab.L * (100 / lmL);
      lab.L += (correctedL - lab.L) * intensity;
    }
    const corrA = lab.a - lightmapA[i];
    const corrB = lab.b - lightmapB[i];
    lab.a += (corrA - lab.a) * intensity;
    lab.b += (corrB - lab.b) * intensity;

    const rgb = labToRgb(lab.L, lab.a, lab.b);
    dst[idx] = rgb.r; dst[idx + 1] = rgb.g; dst[idx + 2] = rgb.b; dst[idx + 3] = a;
  }
}

function correctRgbDivide(src, dst, lightmapL, _la, _lb, intensity, pixelCount) {
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = src[idx] / 255, g = src[idx + 1] / 255, b = src[idx + 2] / 255;
    const a = src[idx + 3];

    const lmRgb = labToRgb(lightmapL[i], _la[i], _lb[i]);
    const lmR = lmRgb.r / 255, lmG = lmRgb.g / 255, lmB = lmRgb.b / 255;

    const cR = lmR > 0.001 ? r / lmR : r;
    const cG = lmG > 0.001 ? g / lmG : g;
    const cB = lmB > 0.001 ? b / lmB : b;

    dst[idx]     = Math.round(Math.min(255, Math.max(0, (r + (cR - r) * intensity) * 255)));
    dst[idx + 1] = Math.round(Math.min(255, Math.max(0, (g + (cG - g) * intensity) * 255)));
    dst[idx + 2] = Math.round(Math.min(255, Math.max(0, (b + (cB - b) * intensity) * 255)));
    dst[idx + 3] = a;
  }
}

function correctAdditive(src, dst, lightmapL, _la, _lb, intensity, pixelCount) {
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = src[idx] / 255, g = src[idx + 1] / 255, b = src[idx + 2] / 255;
    const a = src[idx + 3];

    const offset = 1 - Math.max(0, Math.min(1, lightmapL[i] / 100));
    const cR = r + offset;
    const cG = g + offset;
    const cB = b + offset;

    dst[idx]     = Math.round(Math.min(255, Math.max(0, (r + (cR - r) * intensity) * 255)));
    dst[idx + 1] = Math.round(Math.min(255, Math.max(0, (g + (cG - g) * intensity) * 255)));
    dst[idx + 2] = Math.round(Math.min(255, Math.max(0, (b + (cB - b) * intensity) * 255)));
    dst[idx + 3] = a;
  }
}

function correctLevels(src, dst, lightmapL, _la, _lb, intensity, pixelCount) {
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = src[idx] / 255, g = src[idx + 1] / 255, b = src[idx + 2] / 255;
    const a = src[idx + 3];

    const wp = Math.max(0.01, lightmapL[i] / 100);
    const cR = r / wp;
    const cG = g / wp;
    const cB = b / wp;

    dst[idx]     = Math.round(Math.min(255, Math.max(0, (r + (cR - r) * intensity) * 255)));
    dst[idx + 1] = Math.round(Math.min(255, Math.max(0, (g + (cG - g) * intensity) * 255)));
    dst[idx + 2] = Math.round(Math.min(255, Math.max(0, (b + (cB - b) * intensity) * 255)));
    dst[idx + 3] = a;
  }
}

// ═══════════════════════════════════════════════════════════════
// Dispatcher
// ═══════════════════════════════════════════════════════════════

const MODE_FUNCTIONS = {
  'lab-divide': correctLabDivide,
  'rgb-divide': correctRgbDivide,
  'additive':   correctAdditive,
  'levels':     correctLevels,
};

/**
 * @param {ImageData} srcData
 * @param {Float32Array} lightmapL
 * @param {Float32Array} lightmapA
 * @param {Float32Array} lightmapB
 * @param {number} intensity 0–1
 * @param {string} mode
 * @param {{softShoulder: boolean, highlightGuard: boolean}} highlights
 */
function applyCorrection(srcData, lightmapL, lightmapA, lightmapB, intensity, mode, highlights) {
  const w = srcData.width;
  const h = srcData.height;
  const pixelCount = w * h;
  const out = new ImageData(w, h);
  const fn = MODE_FUNCTIONS[mode || 'lab-divide'];
  fn(srcData.data, out.data, lightmapL, lightmapA, lightmapB, intensity, pixelCount);

  // Post-process highlight protection (order matters: guard first, then shoulder)
  if (highlights) {
    if (highlights.highlightGuard) applyHighlightGuard(out, srcData, pixelCount);
    if (highlights.softShoulder)   applySoftShoulder(out, pixelCount);
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════
// Lightmap rendering
// ═══════════════════════════════════════════════════════════════

function renderLightmapImage(lightmapL, lightmapA, lightmapB, w, h, colorMode) {
  const out = new ImageData(w, h);
  const dst = out.data;

  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    if (colorMode) {
      const rgb = labToRgb(lightmapL[i], lightmapA[i], lightmapB[i]);
      dst[idx]     = rgb.r;
      dst[idx + 1] = rgb.g;
      dst[idx + 2] = rgb.b;
    } else {
      const v = Math.round(Math.max(0, Math.min(255, lightmapL[i] * 2.55)));
      dst[idx] = dst[idx + 1] = dst[idx + 2] = v;
    }
    dst[idx + 3] = 255;
  }
  return out;
}
