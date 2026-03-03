// main.tsx — Framer plugin entry point (headless editImage mode)

import { framer } from "framer-plugin"
import { sampleBorders, buildLightmap } from "./lightmap"
import { applyCorrection } from "./correction"
import { bytesFromCanvas } from "./utils"

const image = await framer.getImage()

if (!image) {
  framer.closePlugin("Aucune image selectionnee")
  throw new Error("No image")
}

const { mimeType } = await image.getData()
const bitmap = await image.loadBitmap()

// Downscale if larger than 6000px on either dimension
const MAX_DIM = 6000
let w = bitmap.width
let h = bitmap.height
if (w > MAX_DIM || h > MAX_DIM) {
  const scale = Math.min(MAX_DIM / w, MAX_DIM / h)
  w = Math.round(w * scale)
  h = Math.round(h * scale)
}

const canvas = document.createElement("canvas")
canvas.width = w
canvas.height = h
const ctx = canvas.getContext("2d")!
ctx.drawImage(bitmap, 0, 0, w, h)
const imageData = ctx.getImageData(0, 0, w, h)

// Correction pipeline
const points = sampleBorders(imageData, 0.03, 20)
const lightmap = buildLightmap(points, w, h)
const corrected = applyCorrection(imageData, lightmap.L, lightmap.a, lightmap.b, 0.85)

// Write result as WebP
ctx.putImageData(corrected, 0, 0)
const bytes = await bytesFromCanvas(canvas, "image/webp", 0.92)
await framer.setImage({ image: { bytes: bytes as Uint8Array<ArrayBuffer>, mimeType: "image/webp" } })
framer.closePlugin("Correction appliquee ✓")
