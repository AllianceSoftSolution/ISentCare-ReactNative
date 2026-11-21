import type { TodayShift } from '@/api/shifts';
import type { CalendarShift } from '@/api/calendar';
import type { WorkItem } from '@/api/work';

/**
 * Stale-while-revalidate (SWR) for work lists:
 * 1. Show last cached payload immediately (no full-screen flash on revisit).
 * 2. Refetch in the background on tab focus / filter change / after mutations.
 * 3. Mutations always hit the live API; then invalidate related caches.
 */
export const WORK_LIST_TTL_MS = 45_000;

export type WorkListKey =
  | 'per_diem'
  | 'completed'
  | 'permanent'
  | 'today'
  | 'calendar'
  | 'shift_counts';

export type CompletedPeriod = 'all' | 'month' | 'date';

export type CompletedListPayload = {
  results: WorkItem[];
  hasMore: boolean;
  page: number;
};

type WorkListPayloadMap = {
  per_diem: { results: WorkItem[]; hasMore: boolean; range: number; page: number };
  /** Legacy single-slot; prefer get/setCompletedFilterCache for All / month / date. */
  completed: CompletedListPayload & { period: CompletedPeriod; date: string | null };
  permanent: { results: WorkItem[]; hasMore: boolean; page: number };
  today: TodayShift[];
  calendar: { year: number; month: number; events: CalendarShift[] };
  shift_counts: { available: number; completed: number };
};

type CacheEntry<T> = {
  data: T;
  updatedAt: number;
};

const cache: {
  [K in WorkListKey]?: CacheEntry<WorkListPayloadMap[K]>;
} = {};

/** One SWR bucket per completed filter so switching All ↔ month ↔ date restores instantly. */
const completedFilterCache: Record<string, CacheEntry<CompletedListPayload>> = {};

export function completedFilterCacheKey(
  period: CompletedPeriod,
  date: string | null = null,
): string {
  if (period === 'date') return `date:${date || ''}`;
  return period;
}

export function getCompletedFilterCache(
  period: CompletedPeriod,
  date: string | null = null,
): CacheEntry<CompletedListPayload> | null {
  if (period === 'date' && !date) return null;
  return completedFilterCache[completedFilterCacheKey(period, date)] ?? null;
}

export function setCompletedFilterCache(
  period: CompletedPeriod,
  date: string | null,
  data: CompletedListPayload,
) {
  if (period === 'date' && !date) return;
  completedFilterCache[completedFilterCacheKey(period, date)] = {
    data,
    updatedAt: Date.now(),
  };
  // Keep legacy slot in sync for callers that still read `completed`.
  setWorkListCache('completed', {
    ...data,
    period,
    date: period === 'date' ? date : null,
  });
}

export function getWorkListCache<K extends WorkListKey>(
  key: K,
): CacheEntry<WorkListPayloadMap[K]> | null {
  return (cache[key] as CacheEntry<WorkListPayloadMap[K]> | undefined) ?? null;
}

export function setWorkListCache<K extends WorkListKey>(
  key: K,
  data: WorkListPayloadMap[K],
) {
  cache[key] = {
    data,
    updatedAt: Date.now(),
  } as (typeof cache)[K];
}

export function isWorkListCacheFresh(updatedAt: number, ttlMs = WORK_LIST_TTL_MS) {
  return Date.now() - updatedAt < ttlMs;
}

export function removeWorkItemFromCache(key: 'per_diem' | 'permanent' | 'today', id: number) {
  if (key === 'today') {
    const entry = getWorkListCache('today');
    if (!entry) return;
    setWorkListCache(
      'today',
      entry.data.filter((item) => item.id !== id),
    );
    return;
  }

  if (key === 'per_diem') {
    const entry = getWorkListCache('per_diem');
    if (!entry) return;
    setWorkListCache('per_diem', {
      ...entry.data,
      results: entry.data.results.filter((item) => item.id !== id),
    });
    return;
  }

  const entry = getWorkListCache('permanent');
  if (!entry) return;
  setWorkListCache('permanent', {
    ...entry.data,
    results: entry.data.results.filter((item) => item.id !== id),
  });
}

export function invalidateWorkListCache(key?: WorkListKey) {
  if (key === 'completed') {
    delete cache.completed;
    Object.keys(completedFilterCache).forEach((item) => {
      delete completedFilterCache[item];
    });
    return;
  }
  if (key) {
    delete cache[key];
    return;
  }
  (Object.keys(cache) as WorkListKey[]).forEach((item) => {
    delete cache[item];
  });
  Object.keys(completedFilterCache).forEach((item) => {
    delete completedFilterCache[item];
  });
}
