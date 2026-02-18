import type { PolicySummary } from './types';

interface CacheEntry {
  summary: PolicySummary;
  cachedAt: number;
  ttl: number;
}

const CACHE_PREFIX = 'cache:';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_PRUNE_THRESHOLD = 8 * 1024 * 1024;

async function pruneExpiredEntries(): Promise<number> {
  const all = await chrome.storage.local.get(null) as Record<string, CacheEntry>;
  const now = Date.now();
  const expiredKeys = Object.keys(all).filter((key) => {
    if (!key.startsWith(CACHE_PREFIX)) return false;
    const entry = all[key];
    return now > entry.cachedAt + entry.ttl;
  });
  if (expiredKeys.length > 0) {
    await chrome.storage.local.remove(expiredKeys);
  }
  return expiredKeys.length;
}

export async function getCachedSummary(domain: string): Promise<PolicySummary | null> {
  const key = `${CACHE_PREFIX}${domain}`;
  const result = await chrome.storage.local.get(key) as Record<string, CacheEntry>;
  const entry = result[key];
  if (!entry) return null;
  if (Date.now() > entry.cachedAt + entry.ttl) {
    await chrome.storage.local.remove(key);
    return null;
  }
  return entry.summary;
}

export async function setCachedSummary(
  domain: string,
  summary: PolicySummary,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<void> {
  const bytesUsed = await chrome.storage.local.getBytesInUse(null);
  if (bytesUsed > STORAGE_PRUNE_THRESHOLD) {
    await pruneExpiredEntries();
  }
  const key = `${CACHE_PREFIX}${domain}`;
  const entry: CacheEntry = {
    summary,
    cachedAt: Date.now(),
    ttl: ttlMs,
  };
  await chrome.storage.local.set({ [key]: entry });
}

export async function clearCache(domain?: string): Promise<void> {
  if (domain !== undefined) {
    await chrome.storage.local.remove(`${CACHE_PREFIX}${domain}`);
    return;
  }
  const all = await chrome.storage.local.get(null) as Record<string, CacheEntry>;
  const cacheKeys = Object.keys(all).filter((key) => key.startsWith(CACHE_PREFIX));
  if (cacheKeys.length > 0) {
    await chrome.storage.local.remove(cacheKeys);
  }
}

export async function getCacheStats(): Promise<{
  entries: number;
  bytesUsed: number;
  oldestEntryMs: number | null;
}> {
  const all = await chrome.storage.local.get(null) as Record<string, CacheEntry>;
  const cacheKeys = Object.keys(all).filter((key) => key.startsWith(CACHE_PREFIX));
  const bytesUsed = await chrome.storage.local.getBytesInUse(null);

  let oldestEntryMs: number | null = null;
  for (const key of cacheKeys) {
    const { cachedAt } = all[key];
    if (oldestEntryMs === null || cachedAt < oldestEntryMs) {
      oldestEntryMs = cachedAt;
    }
  }

  return {
    entries: cacheKeys.length,
    bytesUsed,
    oldestEntryMs,
  };
}
