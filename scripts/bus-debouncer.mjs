const cache = new Map();
const RECENT_WINDOW_MS = 5000;

function eventFingerprint(event) {
  const key = event.event || event.type || 'unknown';
  const payload = event.payload || event.data || {};
  return `${key}:${JSON.stringify(payload)}`;
}

const isDuplicate = (event) => {
  try {
    const fp = eventFingerprint(event);
    const now = Date.now();
    if (cache.has(fp) && (now - cache.get(fp)) < RECENT_WINDOW_MS) {
      return true;
    }
    cache.set(fp, now);

    if (cache.size > 1000) {
      const oldest = [...cache.entries()].reduce((min, [k, v]) =>
        v < min[1] ? [k, v] : min
      );
      cache.delete(oldest[0]);
    }
    return false;
  } catch {
    return false;
  }
};

const isNoise = (event) => {
  try {
    if (!event || !event.event || !event.event.startsWith('agent:')) return false;
    if (event.event === 'agent:voicemail:sweep' && !event.payload?.hasPending) return true;
    return false;
  } catch {
    return false;
  }
};

const deduplicateEvents = (events) => {
  const seen = new Set();
  return events.filter((event) => {
    try {
      const fp = eventFingerprint(event);
      if (seen.has(fp)) return false;
      seen.add(fp);
      return true;
    } catch {
      return true;
    }
  }).filter((event) => !isNoise(event));
};

export { isDuplicate, isNoise, deduplicateEvents, eventFingerprint, cache };
