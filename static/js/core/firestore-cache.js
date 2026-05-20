const memoryCache = new Map();

function readLocalCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function getFreshCache(key, ttlMs) {
  const now = Date.now();
  const cached = memoryCache.get(key) || readLocalCache(key);

  if (!cached || now - cached.savedAt > ttlMs) {
    return null;
  }

  memoryCache.set(key, cached);
  return cached.items;
}

export function getCachedQuery(query, key, options = {}) {
  const ttlMs = options.ttlMs || 60 * 1000;
  const cacheKey = `cs13:query:${key}`;

  if (!options.force) {
    const cachedItems = getFreshCache(cacheKey, ttlMs);
    if (cachedItems) {
      return Promise.resolve(cachedItems);
    }
  }

  return query.get().then((snapshot) => {
    const items = [];
    snapshot.forEach((doc) => {
      const item = { id: doc.id, ...doc.data() };
      items.push(options.normalizeItem ? options.normalizeItem(item) : item);
    });

    const cacheEntry = { savedAt: Date.now(), items };
    memoryCache.set(cacheKey, cacheEntry);
    writeLocalCache(cacheKey, cacheEntry);
    return items;
  });
}

export function clearCachedQuery(key) {
  const cacheKey = `cs13:query:${key}`;
  memoryCache.delete(cacheKey);

  try {
    localStorage.removeItem(cacheKey);
  } catch {}
}
