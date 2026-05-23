const BACKGROUNDS = Object.freeze([
  '/static/images/backgrounds/1.jpg',
  '/static/images/backgrounds/2.jpg',
  '/static/images/backgrounds/3.jpg',
  '/static/images/backgrounds/4.jpg',
  '/static/images/backgrounds/5.jpg',
  '/static/images/backgrounds/6.jpg',
  '/static/images/backgrounds/7.jpg',
  '/static/images/backgrounds/8.jpg',
  '/static/images/backgrounds/9.jpg',
  '/static/images/backgrounds/10.jpg',
]);

function getGlassOptions(element) {
  const isMobile = window.matchMedia('(max-width: 760px)').matches;
  const isTargetPopup =
    element &&
    (element.closest('#change-password-modal') ||
      element.closest('#edit-album-modal') ||
      element.closest('#edit-poll-modal') ||
      element.closest('#new-chat-modal'));
  return {
    radius: isMobile ? 32 : 60,
    bezelWidth: 20,
    glassThickness: 300,
    blur: isTargetPopup ? 3 : 0,
    refractiveIndex: 1.5,
    surface: 'convexSquircle',
    specularOpacity: 1,
  };
}

const BG_COLORFUL_RANGES = Object.freeze({
  '/static/images/backgrounds/1.jpg': [[17, 99]],
  '/static/images/backgrounds/2.jpg': [[16, 86]],
  '/static/images/backgrounds/3.jpg': [[0, 22]],
  '/static/images/backgrounds/4.jpg': [[0, 36]],
  '/static/images/backgrounds/5.jpg': [[73, 99]],
  '/static/images/backgrounds/6.jpg': [
    [8, 34],
    [75, 99],
  ],
  '/static/images/backgrounds/7.jpg': [[59, 99]],
  '/static/images/backgrounds/8.jpg': [
    [0, 17],
    [86, 99],
  ],
  '/static/images/backgrounds/9.jpg': [[8, 32]],
  '/static/images/backgrounds/10.jpg': [
    [5, 16],
    [40, 99],
  ],
});

function pickRandomBackground() {
  return BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
}

function setRandomBackground() {
  const background = pickRandomBackground();
  document.documentElement.style.setProperty(
    '--page-background',
    `url("${background}")`,
  );
  const ranges = BG_COLORFUL_RANGES[background] || [[0, 100]];
  const range = ranges[Math.floor(Math.random() * ranges.length)];
  const xPct = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
  document.documentElement.style.setProperty(
    '--page-background-position',
    `${xPct}% center`,
  );
}

function mountGlassFilter(createLiquidGlass, element, registry) {
  const rect = element.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

  if (!width || !height) {
    return;
  }

  const current = registry.get(element);
  if (current && current.width === width && current.height === height) {
    return;
  }

  if (current?.svg) {
    current.svg.remove();
  }

  const glass = createLiquidGlass({
    width,
    height,
    ...getGlassOptions(element),
  });

  const holder = document.createElement('div');
  holder.innerHTML = glass.svgFilter;
  const svg = holder.firstElementChild;

  if (svg) {
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.style.width = '0';
    svg.style.height = '0';
    svg.style.overflow = 'hidden';
    svg.style.pointerEvents = 'none';
    document.body.appendChild(svg);
  }

  element.style.setProperty('--liquid-glass-filter', glass.filterRef);
  element.style.backdropFilter = glass.filterRef;
  element.style.WebkitBackdropFilter = glass.filterRef;
  element.dataset.liquidGlassMounted = 'true';
  registry.set(element, { svg, width, height });
}

export function initPageEffects(createLiquidGlass) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  setRandomBackground();

  if (typeof createLiquidGlass !== 'function') {
    return () => {};
  }

  const registry = new Map();
  let elements = [];

  const syncElements = () => {
    elements = Array.from(document.querySelectorAll('[data-liquid-glass]'));

    for (const element of elements) {
      if (registry.has(element)) continue;
      registry.set(element, { svg: null, width: 0, height: 0 });
      if (resizeObserver) {
        resizeObserver.observe(element);
      }
    }

    for (const element of Array.from(registry.keys())) {
      if (elements.includes(element)) continue;
      const current = registry.get(element);
      current?.svg?.remove();
      element.style.removeProperty('--liquid-glass-filter');
      element.style.removeProperty('backdrop-filter');
      element.style.removeProperty('-webkit-backdrop-filter');
      delete element.dataset.liquidGlassMounted;
      resizeObserver?.unobserve(element);
      registry.delete(element);
    }
  };

  const refreshAll = () => {
    syncElements();
    for (const element of elements) {
      mountGlassFilter(createLiquidGlass, element, registry);
    }
  };

  const resizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver((entries) => {
          for (const entry of entries) {
            mountGlassFilter(createLiquidGlass, entry.target, registry);
          }
        })
      : null;

  syncElements();
  requestAnimationFrame(refreshAll);
  window.addEventListener('resize', refreshAll);
  window.addEventListener('liquid-glass:refresh', refreshAll);

  return () => {
    window.removeEventListener('resize', refreshAll);
    window.removeEventListener('liquid-glass:refresh', refreshAll);
    resizeObserver?.disconnect();

    for (const { svg } of registry.values()) {
      svg?.remove();
    }

    for (const element of elements) {
      element.style.removeProperty('--liquid-glass-filter');
      element.style.removeProperty('backdrop-filter');
      element.style.removeProperty('-webkit-backdrop-filter');
      delete element.dataset.liquidGlassMounted;
    }

    registry.clear();
  };
}
