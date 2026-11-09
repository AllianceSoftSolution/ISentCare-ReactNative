import { professionalApiClient } from '@/api/apiClient';
import { formatApiFailure } from '@/api/work';

export type MyShiftApplication = {
  id: number;
  status?: string | null;
  shift_id?: number | null;
  job?: {
    id?: number;
    start_date?: string | null;
    timing?: string | null;
    bill_rate?: number | string | null;
    facility?: string | null;
    state?: string | null;
    profession?: string | { name?: string } | null;
  } | null;
};

type PageResponse = {
  count?: number;
  next?: string | null;
  results?: MyShiftApplication[];
};

export type MyShiftsPage = {
  results: MyShiftApplication[];
  hasMore: boolean;
};

export async function fetchMyShiftApplications(page: number): Promise<MyShiftsPage> {
  const response = await professionalApiClient.get<PageResponse | MyShiftApplication[]>(
    `/per_diem_job_applications/?page=${page}`,
  );
  if (!response.ok) {
    throw new Error(formatApiFailure(response, 'Unable to load your shifts.'));
  }

  if (Array.isArray(response.data)) {
    return { results: response.data, hasMore: false };
  }

  const results = Array.isArray(response.data?.results) ? response.data.results : null;
  if (!results) throw new Error('The server returned an invalid shifts list.');
  return { results, hasMore: Boolean(response.data?.next) };
}

export async function dropShiftApplication(applicationId: number): Promise<void> {
  const response = await professionalApiClient.get(
    `/per_diem_job_applications/${applicationId}/cancel_shift/`,
  );
  if (!response.ok) {
    throw new Error(formatApiFailure(response, 'Unable to drop this shift.'));
  }
}

export function professionName(value: MyShiftApplication['job']): string {
  const profession = value?.profession;
  if (typeof profession === 'string') return profession;
  if (profession && typeof profession === 'object' && typeof profession.name === 'string') {
    return profession.name;
  }
  return 'Profession';
}
