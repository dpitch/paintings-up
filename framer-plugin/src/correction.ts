// correction.ts — LAB color space utilities + LAB Divide correction

// ═══════════════════════════════════════════════════════════════
// LAB color space utilities
// ═══════════════════════════════════════════════════════════════

function srgbToLinear(c: number): number {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  c = Math.max(0, Math.min(1, c))
  return c <= 0.0031308
    ? Math.round(c * 12.92 * 255)
    : Math.round((1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255)
}

function rgbToXyz(r: number, g: number, b: number) {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  return {
    x: 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb,
    y: 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb,
    z: 0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb,
  }
}

function xyzToRgb(x: number, y: number, z: number) {
  const lr =  3.2404542 * x - 1.5371385 * y - 0.4985314 * z
  const lg = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z
  const lb =  0.0556434 * x - 0.2040259 * y + 1.0572252 * z
  return { r: linearToSrgb(lr), g: linearToSrgb(lg), b: linearToSrgb(lb) }
}

const D65 = { x: 0.95047, y: 1.0, z: 1.08883 }

function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
}

function labFInv(t: number): number {
  return t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787
}

function xyzToLab(x: number, y: number, z: number) {
  const fx = labF(x / D65.x)
  const fy = labF(y / D65.y)
  const fz = labF(z / D65.z)
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

function labToXyz(L: number, a: number, b: number) {
  const fy = (L + 16) / 116
  const fx = a / 500 + fy
  const fz = fy - b / 200
  return {
    x: D65.x * labFInv(fx),
    y: D65.y * labFInv(fy),
    z: D65.z * labFInv(fz),
  }
}

export function rgbToLab(r: number, g: number, b: number) {
  const xyz = rgbToXyz(r, g, b)
  return xyzToLab(xyz.x, xyz.y, xyz.z)
}

function labToRgb(L: number, a: number, b: number) {
  const xyz = labToXyz(L, a, b)
  return xyzToRgb(xyz.x, xyz.y, xyz.z)
}

// ═══════════════════════════════════════════════════════════════
// LAB Divide correction
// ═══════════════════════════════════════════════════════════════

export function applyCorrection(
  srcData: ImageData,
  lightmapL: Float32Array,
  lightmapA: Float32Array,
  lightmapB: Float32Array,
  intensity: number,
): ImageData {
  const w = srcData.width
  const h = srcData.height
  const pixelCount = w * h
  const out = new ImageData(w, h)
  const src = srcData.data
  const dst = out.data

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4
    const r = src[idx], g = src[idx + 1], b = src[idx + 2], a = src[idx + 3]
    const lab = rgbToLab(r, g, b)

    const lmL = lightmapL[i]
    if (lmL > 0) {
      const correctedL = lab.L * (100 / lmL)
      lab.L += (correctedL - lab.L) * intensity
    }
    const corrA = lab.a - lightmapA[i]
    const corrB = lab.b - lightmapB[i]
    lab.a += (corrA - lab.a) * intensity
    lab.b += (corrB - lab.b) * intensity

    const rgb = labToRgb(lab.L, lab.a, lab.b)
    dst[idx] = rgb.r; dst[idx + 1] = rgb.g; dst[idx + 2] = rgb.b; dst[idx + 3] = a
  }

  return out
}
