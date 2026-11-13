import type { TodayShift } from '@/api/shifts';
import type { CalendarShift } from '@/api/calendar';
import type { WorkItem } from '@/api/work';

/** Soft age hint for opportunistic UX; screens still revalidate on focus. */
export const WORK_LIST_TTL_MS = 45_000;

export type WorkListKey =
  | 'per_diem'
  | 'completed'
  | 'permanent'
  | 'today'
  | 'calendar'
  | 'shift_counts';

type WorkListPayloadMap = {
  per_diem: { results: WorkItem[]; hasMore: boolean; range: number; page: number };
  completed: { results: WorkItem[]; hasMore: boolean; page: number };
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
  if (key) {
    delete cache[key];
    return;
  }
  (Object.keys(cache) as WorkListKey[]).forEach((item) => {
    delete cache[item];
  });
}
