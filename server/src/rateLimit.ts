export function createRateLimiter() {
  const store = new Map<string, { count: number; resetAt: number }>();
  return (key: string, limit: number, windowMs: number): boolean => {
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= limit) {
      return false;
    }
    entry.count += 1;
    return true;
  };
}
