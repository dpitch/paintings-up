// lang.js — Internationalization (FR / EN)

const I18N = {
  fr: {
    title: 'Paintings Up',
    subtitle: 'Corriger l\'éclairage inégal sur les photos de tableaux',
    dropText: 'Déposez une photo ici, ou cliquez pour parcourir',
    intensity: 'Intensité',
    showLightmap: 'Voir la lightmap',
    download: 'Télécharger corrigé',
    lightmapGray: 'Lightmap (gris)',
    lightmapColor: 'Lightmap (couleur)',
    before: 'Avant',
    after: 'Après',
    loading: 'Chargement de l\'image...',
    sampling: 'Échantillonnage des bords...',
    buildingLightmap: 'Construction de la lightmap...',
    applying: 'Application de la correction...',
    highlightSection: 'Protection hautes lumières',
    // Correction modes
    'mode.lab-divide': 'LAB Divide',
    'mode.lab-divide.desc': 'Correction perceptuelle de luminosité en espace LAB',
    'mode.rgb-divide': 'RGB Divide',
    'mode.rgb-divide.desc': 'Division directe par canal — rapide, neutre',
    'mode.additive': 'Lumière linéaire',
    'mode.additive.desc': 'Décalage additif simple',
    'mode.levels': 'Niveaux',
    'mode.levels.desc': 'Remappage du point blanc par canal',
    // Highlight options
    'hl.soft-shoulder': 'Épaule douce',
    'hl.soft-shoulder.desc': 'Courbe filmique — comprime les hautes lumières au lieu de les écrêter',
    'hl.highlight-guard': 'Protection clairs',
    'hl.highlight-guard.desc': 'Réduit la correction sur les pixels lumineux pour préserver le détail',
    brightnessLift: 'Luminosité',
    lightmapMethod: 'Lightmap',
    methodBilinear: 'Bilinéaire',
    methodPoly2: 'Poly degré 2',
    methodPoly3: 'Poly degré 3',
    stepReading: 'Lecture de l\'image…',
    stepSampling: 'Analyse des bords du tableau…',
    stepLightmap: 'Construction de la carte de lumière…',
    stepCorrecting: 'Correction de l\'éclairage…',
    advanced: 'Avancé',
    preparing: 'Préparation…',
    preparingPng: 'Préparation PNG…',
    processingMode: 'Changement en cours…',
    qualityWeb: 'Web',
    'qualityWeb.desc': 'Image réduite, export WebP compressé',
    qualityFull: 'Pleine qualité',
    'qualityFull.desc': 'Dimensions originales, export PNG lossless',
  },
  en: {
    title: 'Paintings Up',
    subtitle: 'Fix uneven lighting on framed artwork photos',
    dropText: 'Drop a painting photo here, or click to browse',
    intensity: 'Intensity',
    showLightmap: 'Show lightmap',
    download: 'Download corrected',
    lightmapGray: 'Lightmap (gray)',
    lightmapColor: 'Lightmap (color)',
    before: 'Before',
    after: 'After',
    loading: 'Loading image...',
    sampling: 'Sampling borders...',
    buildingLightmap: 'Building lightmap...',
    applying: 'Applying correction...',
    highlightSection: 'Highlight protection',
    // Correction modes
    'mode.lab-divide': 'LAB Divide',
    'mode.lab-divide.desc': 'Perceptual luminosity correction in LAB space',
    'mode.rgb-divide': 'RGB Divide',
    'mode.rgb-divide.desc': 'Direct per-channel divide — fast, neutral',
    'mode.additive': 'Linear Light',
    'mode.additive.desc': 'Simple additive offset',
    'mode.levels': 'Levels',
    'mode.levels.desc': 'Remap white point per channel',
    // Highlight options
    'hl.soft-shoulder': 'Soft Shoulder',
    'hl.soft-shoulder.desc': 'Filmic rolloff — compresses highlights instead of clipping',
    'hl.highlight-guard': 'Highlight Guard',
    'hl.highlight-guard.desc': 'Eases off correction on bright pixels to preserve detail',
    brightnessLift: 'Brightness',
    lightmapMethod: 'Lightmap',
    methodBilinear: 'Bilinear',
    methodPoly2: 'Poly degree 2',
    methodPoly3: 'Poly degree 3',
    stepReading: 'Reading the image…',
    stepSampling: 'Analyzing painting edges…',
    stepLightmap: 'Building the light map…',
    stepCorrecting: 'Correcting the lighting…',
    advanced: 'Advanced',
    preparing: 'Preparing…',
    preparingPng: 'Preparing PNG…',
    processingMode: 'Switching mode…',
    qualityWeb: 'Web',
    'qualityWeb.desc': 'Resized image, compressed WebP export',
    qualityFull: 'Full quality',
    'qualityFull.desc': 'Original dimensions, lossless PNG export',
  },
};

let currentLang = 'fr';

function t(key) {
  return I18N[currentLang][key] || I18N['en'][key] || key;
}

function setLang(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;

  // Update all elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });

  // Update lang switcher active state
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  // Dispatch event for dynamic content
  window.dispatchEvent(new CustomEvent('langchange'));
}
