// export.js — Download corrected image and lightmap

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function downloadCorrectedImage() {
  const canvas = document.getElementById('result-canvas');
  if (!canvas) return;
  downloadCanvas(canvas, 'corrected.png');
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
  downloadCanvas(canvas, `lightmap-${suffix}.png`);
}
