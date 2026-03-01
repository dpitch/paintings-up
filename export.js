// export.js — Download corrected image and lightmap

const MAX_DIMENSION = 5000;
const MAX_FILE_SIZE = 1.5 * 1024 * 1024; // 1.5 MB

/**
 * Resize a canvas if either dimension exceeds maxDim, preserving aspect ratio.
 * Returns a new canvas (or the original if no resize needed).
 */
function resizeIfNeeded(srcCanvas, maxDim) {
  let w = srcCanvas.width;
  let h = srcCanvas.height;
  if (w <= maxDim && h <= maxDim) return srcCanvas;

  const scale = maxDim / Math.max(w, h);
  const nw = Math.round(w * scale);
  const nh = Math.round(h * scale);

  const out = document.createElement('canvas');
  out.width = nw;
  out.height = nh;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(srcCanvas, 0, 0, nw, nh);
  return out;
}

/**
 * Export a canvas as JPEG, iterating quality downward until file size ≤ maxBytes.
 */
function downloadCanvasAsJpeg(canvas, filename, maxBytes) {
  let quality = 0.92;
  let dataUrl;

  while (quality >= 0.1) {
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    // dataUrl length in base64 ≈ actual bytes * 4/3 + header
    const approxBytes = Math.round((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3 / 4);
    if (approxBytes <= maxBytes) break;
    quality -= 0.05;
  }

  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

/**
 * Download as PNG (kept for lightmaps).
 */
function downloadCanvasPng(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function downloadCorrectedImage() {
  const canvas = document.getElementById('result-canvas');
  if (!canvas) return;
  const resized = resizeIfNeeded(canvas, MAX_DIMENSION);
  const baseName = window._originalName || 'image';
  downloadCanvasAsJpeg(resized, baseName + '-corrected.jpg', MAX_FILE_SIZE);
}

function downloadLightmap(colorMode = false) {
  const state = window.appState;
  if (!state || !state.lightmap) return;

  const { L, a, b } = state.lightmap;
  const w = state.width;
  const h = state.height;

  const lmData = renderLightmapImage(L, a, b, w, h, colorMode);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(lmData, 0, 0);

  const suffix = colorMode ? 'color' : 'grayscale';
  downloadCanvasPng(canvas, `lightmap-${suffix}.png`);
}
