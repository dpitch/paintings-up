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

    // ── Advanced section (collapsed by default) ──────────────
    const details = document.createElement('details');
    details.className = 'advanced-section';
    const summary = document.createElement('summary');
    summary.className = 'panel-separator advanced-toggle';
    summary.textContent = t('advanced');
    details.appendChild(summary);

    const advContent = document.createElement('div');
    advContent.className = 'advanced-content';

    // Highlight section label
    const hlLabel = document.createElement('div');
    hlLabel.className = 'panel-separator';
    hlLabel.textContent = t('highlightSection');
    advContent.appendChild(hlLabel);

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
      advContent.appendChild(toggle);
    });

    // Brightness lift slider
    const liftWrap = document.createElement('div');
    liftWrap.className = 'panel-slider';
    liftWrap.innerHTML =
      `<label class="panel-slider-label"><span data-i18n="brightnessLift">${t('brightnessLift')}</span>` +
      `<span class="panel-slider-value">0%</span></label>` +
      `<input type="range" min="0" max="100" value="${Math.round(highlightFlags.brightnessLift * 100) || 0}">`;
    const liftRange = liftWrap.querySelector('input');
    const liftValue = liftWrap.querySelector('.panel-slider-value');
    liftRange.addEventListener('input', () => {
      const v = liftRange.value / 100;
      liftValue.textContent = liftRange.value + '%';
      highlightFlags.brightnessLift = v;
      if (window.appState) {
        applyAndRender(intensityInput.value / 100);
      }
    });
    advContent.appendChild(liftWrap);

    // Lightmap download buttons
    const lmLabel = document.createElement('div');
    lmLabel.className = 'panel-separator';
    lmLabel.textContent = 'Lightmap';
    advContent.appendChild(lmLabel);

    const lmBtns = document.createElement('div');
    lmBtns.className = 'advanced-buttons';
    lmBtns.innerHTML =
      `<button onclick="downloadLightmap(false)" data-i18n="lightmapGray">${t('lightmapGray')}</button>` +
      `<button onclick="downloadLightmap(true)" data-i18n="lightmapColor">${t('lightmapColor')}</button>`;
    advContent.appendChild(lmBtns);

    details.appendChild(advContent);
    techniquePanel.appendChild(details);
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

  // ── Global drag & drop (anywhere on the page) ────────────
  let globalDragCounter = 0;
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  document.body.addEventListener('dragenter', (e) => {
    e.preventDefault();
    globalDragCounter++;
    if (dropZone.style.display !== 'none') {
      document.body.classList.add('dragover-global');
    }
  });
  document.body.addEventListener('dragleave', () => {
    globalDragCounter--;
    if (globalDragCounter <= 0) {
      globalDragCounter = 0;
      document.body.classList.remove('dragover-global');
    }
  });
  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    globalDragCounter = 0;
    document.body.classList.remove('dragover-global');
    if (dropZone.style.display !== 'none') {
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) loadImage(file);
    }
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

  // ── Loading overlay helpers ────────────────────────────────
  const overlay = document.getElementById('loading-overlay');
  const loadingCanvas = document.getElementById('loading-canvas');
  const scanLine = overlay.querySelector('.scan-line');
  const scanGlow = overlay.querySelector('.scan-glow');
  let scanRAF = null;

  function startScanAnimation() {
    const duration = 2500; // ms per sweep
    const start = performance.now();

    function tick(now) {
      const elapsed = (now - start) % duration;
      const progress = elapsed / duration;
      // ease-in-out
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const pct = eased * 100;
      scanLine.style.top = pct + '%';
      scanGlow.style.top = 'calc(' + pct + '% - 60px)';
      scanRAF = requestAnimationFrame(tick);
    }
    scanRAF = requestAnimationFrame(tick);
  }

  function stopScanAnimation() {
    if (scanRAF) {
      cancelAnimationFrame(scanRAF);
      scanRAF = null;
    }
  }

  function showOverlay(img) {
    // Draw blurred preview
    const aspect = img.width / img.height;
    loadingCanvas.width = 120;
    loadingCanvas.height = Math.round(120 / aspect);
    loadingCanvas.getContext('2d').drawImage(img, 0, 0, loadingCanvas.width, loadingCanvas.height);

    // Update aspect ratio of container
    overlay.querySelector('.loading-preview').style.aspectRatio = aspect.toFixed(3);

    // Reset state
    overlay.querySelectorAll('.loading-step').forEach(s => {
      s.classList.remove('active', 'done');
    });
    overlay.classList.remove('hidden', 'revealing', 'exiting');

    startScanAnimation();
  }

  function setStep(stepName) {
    const steps = ['reading', 'sampling', 'lightmap', 'correcting'];
    const idx = steps.indexOf(stepName);
    overlay.querySelectorAll('.loading-step').forEach((el, i) => {
      el.classList.toggle('done', i < idx);
      el.classList.toggle('active', i === idx);
    });
  }

  function hideOverlay() {
    stopScanAnimation();

    // Scale up + fade out
    overlay.classList.add('exiting');
    setTimeout(() => {
      overlay.classList.add('hidden');
      overlay.classList.remove('exiting');
    }, 700);
  }

  // ── Load image ─────────────────────────────────────────────
  function loadImage(file) {
    status.textContent = '';
    // Store original filename without extension
    const dotIdx = file.name.lastIndexOf('.');
    window._originalName = dotIdx > 0 ? file.name.substring(0, dotIdx) : file.name;

    const img = new Image();
    img.onload = () => {
      showOverlay(img);
      setStep('reading');

      // Downscale to max 4000px before processing
      const MAX_DIM = 4000;
      let w = img.width;
      let h = img.height;
      if (w > MAX_DIM || h > MAX_DIM) {
        const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);

      setTimeout(() => {
        processImage(imageData, w, h);
      }, 400);
    };
    img.src = URL.createObjectURL(file);
  }

  function processImage(imageData, w, h) {
    setStep('sampling');

    const worker = new Worker('worker.js');
    worker.onmessage = function(e) {
      const msg = e.data;

      if (msg.type === 'step') {
        setStep(msg.step);
        return;
      }

      if (msg.type === 'done') {
        worker.terminate();
        setStep('correcting');

        // Use setTimeout so the UI updates the step indicator
        setTimeout(() => {
          const lightmap = { L: msg.lightmapL, a: msg.lightmapA, b: msg.lightmapB };

          window.appState = {
            originalData: imageData,
            lightmap,
            width: w,
            height: h,
            points: msg.points,
          };

          const intensity = intensityInput.value / 100;
          applyAndRender(intensity);

          // Show UI behind the overlay
          dropZone.style.display = 'none';
          controls.style.display = 'block';
          workspace.classList.add('active');
          status.textContent = '';

          setTimeout(() => hideOverlay(), 200);
        }, 60);
      }
    };

    // Send pixel data to worker (transfer the buffer for zero-copy)
    const pixelData = new Uint8ClampedArray(imageData.data);
    worker.postMessage(
      { pixelData, w, h },
      [pixelData.buffer]
    );
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
