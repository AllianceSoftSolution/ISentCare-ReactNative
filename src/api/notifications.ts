import { professionalApiClient } from '@/api/apiClient';
import { formatApiFailure } from '@/api/work';

export type AppNotification = {
  id: string;
  message: string;
  createdAt: string;
  kind: 'license_expiry' | 'server';
};

type LicenseRow = {
  id?: number;
  number?: string;
  profession?: string | { name?: string } | null;
  expiry_date?: string | null;
};

type ServerNotification = {
  id?: number;
  message?: string;
  created_at?: string;
};

function professionLabel(value: LicenseRow['profession']) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && typeof value.name === 'string' && value.name.trim()) {
    return value.name.trim();
  }
  return 'Professional license';
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function daysUntilExpiry(expiryDate: string) {
  const expiry = parseDateOnly(expiryDate);
  if (!expiry) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
}

export function buildLicenseExpiryNotifications(licenses: LicenseRow[]): AppNotification[] {
  return licenses.flatMap((license) => {
    const expiry = typeof license.expiry_date === 'string' ? license.expiry_date : null;
    if (!expiry) return [];
    const days = daysUntilExpiry(expiry);
    if (days === null || days < 0 || days > 30) return [];
    const label = professionLabel(license.profession);
    const number = typeof license.number === 'string' && license.number.trim() ? ` (${license.number.trim()})` : '';
    const when = days === 0
      ? 'expires today'
      : days === 1
        ? 'expires tomorrow'
        : `expires in ${days} days`;
    return [{
      id: `license-${license.id ?? expiry}-${license.number ?? 'x'}`,
      message: `Your ${label}${number} ${when}. Renew it to keep picking shifts.`,
      createdAt: new Date().toISOString(),
      kind: 'license_expiry' as const,
    }];
  });
}

export async function fetchLicenseExpiryNotifications(): Promise<AppNotification[]> {
  const response = await professionalApiClient.get<LicenseRow[] | { results?: LicenseRow[] }>('/licenses/');
  if (!response.ok) {
    throw new Error(formatApiFailure(response, 'Unable to check license expiry.'));
  }
  const rows = Array.isArray(response.data)
    ? response.data
    : Array.isArray(response.data?.results)
      ? response.data.results
      : [];
  return buildLicenseExpiryNotifications(rows);
}

export async function fetchServerNotifications(page = 1): Promise<{
  results: AppNotification[];
  hasMore: boolean;
}> {
  const response = await professionalApiClient.get<
    ServerNotification[] | { results?: ServerNotification[]; next?: string | null }
  >(`/user_notifications/?page=${page}`);
  if (!response.ok) {
    throw new Error(formatApiFailure(response, 'Unable to load notifications.'));
  }
  const rows = Array.isArray(response.data)
    ? response.data
    : Array.isArray(response.data?.results)
      ? response.data.results
      : [];
  const hasMore = !Array.isArray(response.data) && Boolean(response.data?.next);
  return {
    hasMore,
    results: rows.map((item, index) => ({
      id: `server-${item.id ?? index}`,
      message: typeof item.message === 'string' && item.message.trim()
        ? item.message.trim()
        : 'You have a new notification.',
      createdAt: typeof item.created_at === 'string' ? item.created_at : new Date().toISOString(),
      kind: 'server' as const,
    })),
  };
}

export type EarningsMonth = {
  month: number;
  label: string;
  pay: number;
  shifts: number;
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function fetchEarningsReport(year = new Date().getFullYear()): Promise<{
  months: EarningsMonth[];
  totalPay: number;
  totalShifts: number;
}> {
  const response = await professionalApiClient.get<{
    results?: { month?: number; pay?: number; shifts?: number }[];
    total_pay?: number;
    total_shifts?: number;
  }>(`/shifts/report/?year=${year}`);
  if (!response.ok) {
    throw new Error(formatApiFailure(response, 'Unable to load earnings report.'));
  }
  const rows = Array.isArray(response.data?.results) ? response.data.results : [];
  const months = MONTH_LABELS.map((label, index) => {
    const row = rows.find((item) => Number(item.month) === index + 1);
    return {
      month: index + 1,
      label,
      pay: Number(row?.pay) || 0,
      shifts: Number(row?.shifts) || 0,
    };
  });
  return {
    months,
    totalPay: Number(response.data?.total_pay) || months.reduce((sum, item) => sum + item.pay, 0),
    totalShifts: Number(response.data?.total_shifts) || months.reduce((sum, item) => sum + item.shifts, 0),
  };
}
