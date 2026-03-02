// export.js — Download corrected image and lightmap

const MAX_DIMENSION = 6000;

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
 * Export a canvas as WebP using toBlob (async, memory-efficient).
 * Iterates quality downward until file size ≤ maxBytes.
 */
async function downloadCanvasAsWebp(canvas, filename, maxBytes) {
  let quality = 0.92;

  while (quality >= 0.1) {
    const blob = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/webp', quality)
    );
    if (blob.size <= maxBytes || quality <= 0.1) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = filename;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    quality -= 0.05;
  }
}

/**
 * Download as PNG (kept for lightmaps).
 */
function downloadCanvasPng(canvas, filename) {
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function downloadCorrectedImage() {
  const canvas = document.getElementById('result-canvas');
  if (!canvas) return;
  const resized = resizeIfNeeded(canvas, MAX_DIMENSION);
  const baseName = window._originalName || 'image';
  downloadCanvasAsWebp(resized, baseName + '-corrected.webp', 1.5 * 1024 * 1024);
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
