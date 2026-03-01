// app.js — Upload handling, UI interactions, before/after slider, technique switching

window.appState = null;

document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const controls = document.getElementById('controls');
  const workspace = document.getElementById('workspace');
  const comparisonArea = document.getElementById('comparison');
  const slider = document.getElementById('comparison-slider');
  const intensityInput = document.getElementById('intensity');
  const intensityValue = document.getElementById('intensity-value');
  const lightmapToggle = document.getElementById('lightmap-toggle');
  const techniquePanel = document.getElementById('technique-panel');
  const status = document.getElementById('status');

  let currentMode = 'lab-divide';
  let highlightFlags = { softShoulder: false, highlightGuard: false };

  // ── Background slider ──────────────────────────────────────
  const bgSlider = document.getElementById('bg-slider');
  bgSlider.addEventListener('input', () => {
    const v = bgSlider.value / 100;
    const c = Math.round(255 * (1 - v));
    document.body.style.setProperty('--bg', `rgb(${c},${c},${c})`);
    document.body.classList.toggle('dark', v > 0.45);
  });

  // ── Build / rebuild technique panel ────────────────────────
  function buildPanel() {
    techniquePanel.innerHTML = '';

    // Mode cards
    CORRECTION_MODES.forEach((mode) => {
      const card = document.createElement('div');
      card.className = 'technique-card' + (mode.id === currentMode ? ' active' : '');
      card.dataset.mode = mode.id;
      card.innerHTML =
        `<div class="tc-name">${t('mode.' + mode.id)}</div>` +
        `<div class="tc-desc">${t('mode.' + mode.id + '.desc')}</div>`;
      card.addEventListener('click', () => {
        currentMode = mode.id;
        techniquePanel.querySelectorAll('.technique-card:not(.highlight-toggle)').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        if (window.appState) {
          applyAndRender(intensityInput.value / 100);
        }
      });
      techniquePanel.appendChild(card);
    });

    // Separator
    const sep = document.createElement('div');
    sep.className = 'panel-separator';
    sep.textContent = t('highlightSection');
    techniquePanel.appendChild(sep);

    // Highlight toggles
    HIGHLIGHT_OPTIONS.forEach((opt) => {
      const key = opt.id === 'soft-shoulder' ? 'softShoulder' : 'highlightGuard';
      const toggle = document.createElement('div');
      toggle.className = 'technique-card highlight-toggle' + (highlightFlags[key] ? ' on' : '');
      toggle.dataset.option = opt.id;
      toggle.innerHTML =
        `<div class="tc-row">` +
          `<div class="tc-name">${t('hl.' + opt.id)}</div>` +
          `<div class="tc-switch"><div class="tc-switch-thumb"></div></div>` +
        `</div>` +
        `<div class="tc-desc">${t('hl.' + opt.id + '.desc')}</div>`;
      toggle.addEventListener('click', () => {
        highlightFlags[key] = !highlightFlags[key];
        toggle.classList.toggle('on', highlightFlags[key]);
        if (window.appState) {
          applyAndRender(intensityInput.value / 100);
        }
      });
      techniquePanel.appendChild(toggle);
    });
  }

  buildPanel();

  // Rebuild panel text on language change
  window.addEventListener('langchange', buildPanel);

  // ── Drop zone ──────────────────────────────────────────────
  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadImage(file);
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadImage(file);
  });

  // ── Intensity slider ───────────────────────────────────────
  intensityInput.addEventListener('input', () => {
    const pct = intensityInput.value;
    intensityValue.textContent = pct + '%';
    if (window.appState) applyAndRender(pct / 100);
  });

  // ── Lightmap overlay toggle ────────────────────────────────
  lightmapToggle.addEventListener('change', () => {
    if (window.appState) renderComparison();
  });

  // ── Before/after slider ────────────────────────────────────
  let dragging = false;

  function startDrag(e) {
    dragging = true;
    moveDrag(e);
  }

  function moveDrag(e) {
    if (!dragging) return;
    const rect = comparisonArea.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let x = (clientX - rect.left) / rect.width;
    x = Math.max(0, Math.min(1, x));
    slider.style.left = (x * 100) + '%';
    document.getElementById('after-clip').style.clipPath =
      `inset(0 ${(1 - x) * 100}% 0 0)`;
  }

  function stopDrag() {
    dragging = false;
  }

  comparisonArea.addEventListener('mousedown', startDrag);
  comparisonArea.addEventListener('touchstart', startDrag, { passive: true });
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('touchmove', moveDrag, { passive: true });
  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('touchend', stopDrag);

  // ── Load image ─────────────────────────────────────────────
  function loadImage(file) {
    status.textContent = t('loading');
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);

      status.textContent = t('sampling');
      requestAnimationFrame(() => {
        processImage(imageData, img.width, img.height);
      });
    };
    img.src = URL.createObjectURL(file);
  }

  function processImage(imageData, w, h) {
    status.textContent = t('buildingLightmap');

    setTimeout(() => {
      const points = sampleBorders(imageData);
      const lightmap = buildLightmap(points, w, h);

      window.appState = {
        originalData: imageData,
        lightmap,
        width: w,
        height: h,
        points,
      };

      const intensity = intensityInput.value / 100;
      applyAndRender(intensity);

      // Show UI
      dropZone.style.display = 'none';
      controls.style.display = 'block';
      workspace.classList.add('active');
      status.textContent = '';
    }, 10);
  }

  function applyAndRender(intensity) {
    const state = window.appState;
    if (!state) return;

    status.textContent = t('applying');

    setTimeout(() => {
      const corrected = applyCorrection(
        state.originalData,
        state.lightmap.L,
        state.lightmap.a,
        state.lightmap.b,
        intensity,
        currentMode,
        highlightFlags
      );
      state.correctedData = corrected;
      renderComparison();
      status.textContent = '';
    }, 10);
  }

  function renderComparison() {
    const state = window.appState;
    if (!state) return;

    const w = state.width;
    const h = state.height;

    const maxW = comparisonArea.clientWidth || 900;
    const displayH = Math.round(maxW * (h / w));
    comparisonArea.style.height = displayH + 'px';

    // Before canvas
    let beforeCanvas = document.getElementById('before-canvas');
    if (!beforeCanvas) {
      beforeCanvas = document.createElement('canvas');
      beforeCanvas.id = 'before-canvas';
      document.getElementById('before-clip').appendChild(beforeCanvas);
    }
    beforeCanvas.width = w;
    beforeCanvas.height = h;
    beforeCanvas.getContext('2d').putImageData(state.originalData, 0, 0);

    // After canvas (or lightmap)
    let afterCanvas = document.getElementById('result-canvas');
    if (!afterCanvas) {
      afterCanvas = document.createElement('canvas');
      afterCanvas.id = 'result-canvas';
      document.getElementById('after-clip').appendChild(afterCanvas);
    }
    afterCanvas.width = w;
    afterCanvas.height = h;

    if (lightmapToggle.checked) {
      const lmData = renderLightmapImage(
        state.lightmap.L, state.lightmap.a, state.lightmap.b,
        w, h, false
      );
      afterCanvas.getContext('2d').putImageData(lmData, 0, 0);
    } else {
      afterCanvas.getContext('2d').putImageData(state.correctedData, 0, 0);
    }

    // Set slider to 50% initially if first render
    if (!state._sliderInit) {
      slider.style.left = '50%';
      document.getElementById('after-clip').style.clipPath = 'inset(0 50% 0 0)';
      state._sliderInit = true;
    }
  }
});
