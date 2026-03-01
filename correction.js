// correction.js — Lightmap-based correction with multiple blending techniques

// ═══════════════════════════════════════════════════════════════
// Correction mode registry
// ═══════════════════════════════════════════════════════════════

const CORRECTION_MODES = [
  { id: 'lab-divide',  name: 'LAB Divide',    desc: 'Perceptual luminosity correction in LAB space' },
  { id: 'rgb-divide',  name: 'RGB Divide',    desc: 'Direct per-channel divide — fast, neutral' },
  { id: 'screen',      name: 'Screen',        desc: 'Inverted lightmap as Screen blend' },
  { id: 'soft-light',  name: 'Soft Light',    desc: 'Subtle correction, preserves contrast' },
  { id: 'overlay',     name: 'Overlay',       desc: 'Stronger correction, boosts contrast' },
  { id: 'gamma',       name: 'Gamma',         desc: 'Per-pixel gamma remap for smooth lift' },
  { id: 'additive',    name: 'Linear Light',  desc: 'Simple additive offset' },
  { id: 'levels',      name: 'Levels',        desc: 'Remap white point per channel' },
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
  // Build per-pixel RGB lightmap from LAB lightmap
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = src[idx] / 255, g = src[idx + 1] / 255, b = src[idx + 2] / 255;
    const a = src[idx + 3];

    // Lightmap as normalized RGB (from LAB)
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

function correctScreen(src, dst, lightmapL, _la, _lb, intensity, pixelCount) {
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = src[idx] / 255, g = src[idx + 1] / 255, b = src[idx + 2] / 255;
    const a = src[idx + 3];

    // Lightmap normalized, inverted
    const lm = Math.max(0.001, lightmapL[i] / 100);
    // Screen: 1 - (1 - px) * lm
    const cR = 1 - (1 - r) * lm;
    const cG = 1 - (1 - g) * lm;
    const cB = 1 - (1 - b) * lm;

    dst[idx]     = Math.round(Math.min(255, Math.max(0, (r + (cR - r) * intensity) * 255)));
    dst[idx + 1] = Math.round(Math.min(255, Math.max(0, (g + (cG - g) * intensity) * 255)));
    dst[idx + 2] = Math.round(Math.min(255, Math.max(0, (b + (cB - b) * intensity) * 255)));
    dst[idx + 3] = a;
  }
}

function _softLight(base, blend) {
  if (blend <= 0.5) {
    return base - (1 - 2 * blend) * base * (1 - base);
  }
  return base + (2 * blend - 1) * (Math.sqrt(base) - base);
}

function correctSoftLight(src, dst, lightmapL, _la, _lb, intensity, pixelCount) {
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = src[idx] / 255, g = src[idx + 1] / 255, b = src[idx + 2] / 255;
    const a = src[idx + 3];

    // Invert lightmap as blend layer
    const blend = 1 - Math.max(0, Math.min(1, lightmapL[i] / 100));
    const cR = _softLight(r, blend);
    const cG = _softLight(g, blend);
    const cB = _softLight(b, blend);

    dst[idx]     = Math.round(Math.min(255, Math.max(0, (r + (cR - r) * intensity) * 255)));
    dst[idx + 1] = Math.round(Math.min(255, Math.max(0, (g + (cG - g) * intensity) * 255)));
    dst[idx + 2] = Math.round(Math.min(255, Math.max(0, (b + (cB - b) * intensity) * 255)));
    dst[idx + 3] = a;
  }
}

function _overlay(base, blend) {
  return base < 0.5
    ? 2 * base * blend
    : 1 - 2 * (1 - base) * (1 - blend);
}

function correctOverlay(src, dst, lightmapL, _la, _lb, intensity, pixelCount) {
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = src[idx] / 255, g = src[idx + 1] / 255, b = src[idx + 2] / 255;
    const a = src[idx + 3];

    const blend = 1 - Math.max(0, Math.min(1, lightmapL[i] / 100));
    const cR = _overlay(r, blend);
    const cG = _overlay(g, blend);
    const cB = _overlay(b, blend);

    dst[idx]     = Math.round(Math.min(255, Math.max(0, (r + (cR - r) * intensity) * 255)));
    dst[idx + 1] = Math.round(Math.min(255, Math.max(0, (g + (cG - g) * intensity) * 255)));
    dst[idx + 2] = Math.round(Math.min(255, Math.max(0, (b + (cB - b) * intensity) * 255)));
    dst[idx + 3] = a;
  }
}

function correctGamma(src, dst, lightmapL, _la, _lb, intensity, pixelCount) {
  const log05 = Math.log(0.5);
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = src[idx] / 255, g = src[idx + 1] / 255, b = src[idx + 2] / 255;
    const a = src[idx + 3];

    const lm = Math.max(0.01, Math.min(0.99, lightmapL[i] / 100));
    const gamma = log05 / Math.log(lm);
    const cR = Math.pow(Math.max(0, r), gamma);
    const cG = Math.pow(Math.max(0, g), gamma);
    const cB = Math.pow(Math.max(0, b), gamma);

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
  'screen':     correctScreen,
  'soft-light': correctSoftLight,
  'overlay':    correctOverlay,
  'gamma':      correctGamma,
  'additive':   correctAdditive,
  'levels':     correctLevels,
};

function applyCorrection(srcData, lightmapL, lightmapA, lightmapB, intensity, mode) {
  const w = srcData.width;
  const h = srcData.height;
  const out = new ImageData(w, h);
  const fn = MODE_FUNCTIONS[mode || 'lab-divide'];
  fn(srcData.data, out.data, lightmapL, lightmapA, lightmapB, intensity, w * h);
  return out;
}

// ═══════════════════════════════════════════════════════════════
// Lightmap rendering (unchanged)
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
