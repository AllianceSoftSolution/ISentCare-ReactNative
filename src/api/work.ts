import { professionalApiClient } from '@/api/apiClient';
import { looksLikeHtml } from '@/utils/apiErrors';

export type WorkItem = {
  id: number;
  start_date?: string | null;
  date?: string | null;
  timing?: string | null;
  bill_rate?: number | string | null;
  pay_rate?: number | string | null;
  pay?: number | string | null;
  facility?: string | null;
  facility_id?: number | null;
  profession?: string | { name?: string } | null;
  speciality?: string | { name?: string } | null;
  state?: string | null;
  city?: string | null;
  fix_time?: boolean;
  tra_assign?: boolean;
  per_place?: boolean;
};

type PageResponse<T> = {
  count?: number;
  next?: string | null;
  results?: T[];
};

export type WorkPage<T> = {
  results: T[];
  hasMore: boolean;
};

export async function fetchWorkCount(endpoint: string): Promise<number> {
  const response = await professionalApiClient.get<PageResponse<unknown> | unknown[]>(
    `${endpoint}?page=1`,
  );
  if (!response.ok) {
    throw new Error(formatApiFailure(response, 'Unable to load shift totals.'));
  }

  if (Array.isArray(response.data)) return response.data.length;
  const count = response.data?.count;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    throw new Error('The server returned invalid shift totals.');
  }
  return count;
}

const TECHNICAL_ERROR_CODES = /^(NETWORK_ERROR|TIMEOUT_ERROR|CONNECTION_ERROR|SERVER_ERROR|CLIENT_ERROR|CANCEL_ERROR|UNKNOWN_ERROR)$/i;

function isUserFacingMessage(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (looksLikeHtml(trimmed)) return false;
  if (TECHNICAL_ERROR_CODES.test(trimmed)) return false;
  if (/^[\w-]+_ERROR$/i.test(trimmed)) return false;
  return true;
}

export function getErrorMessage(data: unknown, fallback: string) {
  if (looksLikeHtml(data)) return fallback;
  const preferredKeys = ['detail', 'details', 'message', 'non-field-error', 'application', 'latitude', 'longitude', 'job'];
  const findMessage = (value: unknown): string | null => {
    if (typeof value === 'string') return isUserFacingMessage(value) ? value : null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const message = findMessage(item);
        if (message) return message;
      }
    } else if (value && typeof value === 'object') {
      const body = value as Record<string, unknown>;
      // Prefer nested API error.message over the generic 500 wrapper detail.
      if (body.error && typeof body.error === 'object') {
        const nested = findMessage((body.error as Record<string, unknown>).message);
        if (nested) return nested;
      }
      for (const key of [...preferredKeys, ...Object.keys(body).filter((key) => !preferredKeys.includes(key))]) {
        const message = findMessage(body[key]);
        if (message) return message;
      }
    }
    return null;
  };
  return findMessage(data) ?? fallback;
}

/** User-facing copy when the device cannot complete an HTTPS call to the API host. */
export function networkReachabilityMessage(problem?: string | null) {
  if (problem === 'TIMEOUT_ERROR') {
    return 'The server took too long to respond. Check your connection and try again.';
  }
  return 'Unable to reach IsentCare. Check your internet connection and try again.';
}

/** Build a user-facing API failure message without raw codes like NETWORK_ERROR. */
export function formatApiFailure(
  response: { status?: number; problem?: string | null; data?: unknown },
  fallback: string,
) {
  if (response.problem === 'NETWORK_ERROR' || response.problem === 'TIMEOUT_ERROR' || response.problem === 'CONNECTION_ERROR') {
    // Apisauce reports these when the host is unreachable, TLS fails, or the request times out —
    // not only when the device has no internet, and not only for a local API.
    return getErrorMessage(response.data, networkReachabilityMessage(response.problem));
  }
  if (response.status === 401 || (response.status === 403 && looksLikeHtml(response.data)) || looksLikeHtml(response.data)) {
    return 'Your session has expired. Please sign in again.';
  }
  return getErrorMessage(response.data, fallback);
}

export type WorkPageOptions = {
  range?: number;
  /** completed_shifts: all | month | date */
  period?: 'all' | 'month' | 'date';
  /** YYYY-MM-DD when period=date */
  date?: string;
};

export async function fetchWorkPage<T>(
  endpoint: string,
  page: number,
  options?: number | WorkPageOptions,
): Promise<WorkPage<T>> {
  const opts: WorkPageOptions =
    typeof options === 'number' ? { range: options } : options ?? {};
  const query = [`page=${page}`];
  if (opts.range !== undefined) query.push(`range=${opts.range}`);
  if (opts.period && opts.period !== 'all') query.push(`period=${opts.period}`);
  if (opts.period === 'date' && opts.date) query.push(`date=${encodeURIComponent(opts.date)}`);

  const response = await professionalApiClient.get<PageResponse<T> | T[]>(
    `${endpoint}?${query.join('&')}`,
  );
  if (!response.ok) {
    throw new Error(formatApiFailure(response, 'Unable to load opportunities.'));
  }

  if (Array.isArray(response.data)) {
    return { results: response.data, hasMore: false };
  }
  if (!response.data || !Array.isArray(response.data.results)) {
    throw new Error('The server returned an invalid opportunities list.');
  }

  return {
    results: response.data.results,
    hasMore: Boolean(response.data.next),
  };
}

export async function applyForWork(endpoint: string, jobId: number) {
  const response = await professionalApiClient.post(endpoint, { job: jobId });
  if (!response.ok) {
    const error = new Error(
      formatApiFailure(response, 'Unable to submit your application.'),
    ) as Error & { status?: number };
    if (typeof response.status === 'number') error.status = response.status;
    throw error;
  }
}

export function itemName(value: WorkItem['profession'] | WorkItem['speciality']) {
  return typeof value === 'string' ? value : value?.name ?? '';
}

export function formatWorkDate(value?: string | null) {
  if (!value) return 'Date unavailable';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatShiftTiming(value?: string | null) {
  const timing = value?.toLowerCase() ?? '';
  if (timing.includes('morning') || timing === 'am') return '7AM-3PM';
  if (timing.includes('evening') || timing === 'pm') return '3PM-11PM';
  return '11PM-7AM';
}

export function formatMoney(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return 'Pay unavailable';
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : 'Pay unavailable';
}

/** Prefer professional pay_rate; fall back to legacy bill_rate payloads. */
export function getShiftPayRate(item: Pick<WorkItem, 'pay_rate' | 'bill_rate'>) {
  if (item.pay_rate !== null && item.pay_rate !== undefined && item.pay_rate !== '') {
    return item.pay_rate;
  }
  return item.bill_rate;
}
