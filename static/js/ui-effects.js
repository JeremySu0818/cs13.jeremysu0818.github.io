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

const GLASS_OPTIONS = Object.freeze({
  radius: 60,
  bezelWidth: 20,
  glassThickness: 300,
  blur: 0,
  refractiveIndex: 1.5,
  surface: 'convexSquircle',
  specularOpacity: 1,
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
}

function mountGlassFilter(createLiquidGlass, element, registry) {
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

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
    ...GLASS_OPTIONS,
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

  element.style.backdropFilter = glass.filterRef;
  element.style.WebkitBackdropFilter = glass.filterRef;
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

  const elements = Array.from(document.querySelectorAll('[data-liquid-glass]'));
  if (elements.length === 0) {
    return () => {};
  }

  const registry = new Map();
  const refreshAll = () => {
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

  for (const element of elements) {
    registry.set(element, { svg: null, width: 0, height: 0 });
    if (resizeObserver) {
      resizeObserver.observe(element);
    }
  }

  requestAnimationFrame(refreshAll);
  window.addEventListener('resize', refreshAll);

  return () => {
    window.removeEventListener('resize', refreshAll);
    resizeObserver?.disconnect();

    for (const { svg } of registry.values()) {
      svg?.remove();
    }

    registry.clear();
  };
}
