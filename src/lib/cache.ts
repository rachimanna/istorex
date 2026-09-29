import "server-only";

// Small in-process TTL cache for hot public catalog queries. Admin mutations call invalidateCatalog()
// so newly published apps appear immediately. (Single-instance deployment; use Redis if you scale out.)
const store = new Map<string, { exp: number; value: unknown }>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as T;
  const value = await fn();
  store.set(key, { exp: Date.now() + ttlMs, value });
  if (store.size > 5000) store.clear();
  return value;
}

export function invalidateCatalog() {
  store.clear();
}
