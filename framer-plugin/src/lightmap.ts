// lightmap.ts — Border sampling and bilinear interpolation

import { rgbToLab } from "./correction"

interface BorderPoint {
  x: number
  y: number
  L: number
  a: number
  b: number
  side: "top" | "bottom" | "left" | "right"
}

export function sampleBorders(
  imageData: ImageData,
  bandWidth = 0.03,
  segments = 20,
): BorderPoint[] {
  const w = imageData.width
  const h = imageData.height
  const data = imageData.data
  const bw = Math.max(2, Math.round(w * bandWidth))
  const bh = Math.max(2, Math.round(h * bandWidth))

  const points: BorderPoint[] = []

  function avgLab(x0: number, y0: number, x1: number, y1: number) {
    let sumL = 0, sumA = 0, sumB = 0, count = 0
    const rx0 = Math.max(0, Math.round(x0))
    const ry0 = Math.max(0, Math.round(y0))
    const rx1 = Math.min(w - 1, Math.round(x1))
    const ry1 = Math.min(h - 1, Math.round(y1))

    for (let y = ry0; y <= ry1; y++) {
      for (let x = rx0; x <= rx1; x++) {
        const idx = (y * w + x) * 4
        const lab = rgbToLab(data[idx], data[idx + 1], data[idx + 2])
        sumL += lab.L
        sumA += lab.a
        sumB += lab.b
        count++
      }
    }
    return count > 0
      ? { L: sumL / count, a: sumA / count, b: sumB / count }
      : { L: 100, a: 0, b: 0 }
  }

  // Top edge
  for (let i = 0; i < segments; i++) {
    const x0 = (i / segments) * w
    const x1 = ((i + 1) / segments) * w - 1
    const lab = avgLab(x0, 0, x1, bh - 1)
    points.push({ x: (x0 + x1) / 2 / w, y: bh / 2 / h, ...lab, side: "top" })
  }

  // Bottom edge
  for (let i = 0; i < segments; i++) {
    const x0 = (i / segments) * w
    const x1 = ((i + 1) / segments) * w - 1
    const lab = avgLab(x0, h - bh, x1, h - 1)
    points.push({ x: (x0 + x1) / 2 / w, y: (h - bh / 2) / h, ...lab, side: "bottom" })
  }

  // Left edge
  for (let i = 0; i < segments; i++) {
    const y0 = (i / segments) * h
    const y1 = ((i + 1) / segments) * h - 1
    const lab = avgLab(0, y0, bw - 1, y1)
    points.push({ x: bw / 2 / w, y: (y0 + y1) / 2 / h, ...lab, side: "left" })
  }

  // Right edge
  for (let i = 0; i < segments; i++) {
    const y0 = (i / segments) * h
    const y1 = ((i + 1) / segments) * h - 1
    const lab = avgLab(w - bw, y0, w - 1, y1)
    points.push({ x: (w - bw / 2) / w, y: (y0 + y1) / 2 / h, ...lab, side: "right" })
  }

  return points
}

export function buildLightmap(
  points: BorderPoint[],
  w: number,
  h: number,
): { L: Float32Array; a: Float32Array; b: Float32Array } {
  const size = w * h
  const mapL = new Float32Array(size)
  const mapA = new Float32Array(size)
  const mapB = new Float32Array(size)

  const sides: Record<string, BorderPoint[]> = { top: [], bottom: [], left: [], right: [] }
  for (const p of points) {
    sides[p.side].push(p)
  }
  sides.top.sort((a, b) => a.x - b.x)
  sides.bottom.sort((a, b) => a.x - b.x)
  sides.left.sort((a, b) => a.y - b.y)
  sides.right.sort((a, b) => a.y - b.y)

  function interpSide(arr: BorderPoint[], t: number, coord: "x" | "y") {
    if (arr.length === 0) return { L: 100, a: 0, b: 0 }
    if (arr.length === 1) return arr[0]

    if (t <= arr[0][coord]) return arr[0]
    if (t >= arr[arr.length - 1][coord]) return arr[arr.length - 1]

    for (let i = 0; i < arr.length - 1; i++) {
      if (t >= arr[i][coord] && t <= arr[i + 1][coord]) {
        const range = arr[i + 1][coord] - arr[i][coord]
        const frac = range > 0 ? (t - arr[i][coord]) / range : 0
        return {
          L: arr[i].L + (arr[i + 1].L - arr[i].L) * frac,
          a: arr[i].a + (arr[i + 1].a - arr[i].a) * frac,
          b: arr[i].b + (arr[i + 1].b - arr[i].b) * frac,
        }
      }
    }
    return arr[arr.length - 1]
  }

  for (let py = 0; py < h; py++) {
    const ny = py / (h - 1)
    const fromLeft = interpSide(sides.left, ny, "y")
    const fromRight = interpSide(sides.right, ny, "y")

    for (let px = 0; px < w; px++) {
      const nx = px / (w - 1)
      const i = py * w + px

      const fromTop = interpSide(sides.top, nx, "x")
      const fromBottom = interpSide(sides.bottom, nx, "x")

      const eps = 0.001
      const wTop = 1 / (ny + eps)
      const wBottom = 1 / (1 - ny + eps)
      const wLeft = 1 / (nx + eps)
      const wRight = 1 / (1 - nx + eps)
      const wSum = wTop + wBottom + wLeft + wRight

      mapL[i] = (fromTop.L * wTop + fromBottom.L * wBottom + fromLeft.L * wLeft + fromRight.L * wRight) / wSum
      mapA[i] = (fromTop.a * wTop + fromBottom.a * wBottom + fromLeft.a * wLeft + fromRight.a * wRight) / wSum
      mapB[i] = (fromTop.b * wTop + fromBottom.b * wBottom + fromLeft.b * wLeft + fromRight.b * wRight) / wSum
    }
  }

  return { L: mapL, a: mapA, b: mapB }
}
