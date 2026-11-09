import { professionalApiClient } from '@/api/apiClient';
import { formatApiFailure } from '@/api/work';

export type CalendarShift = {
  id: number;
  status?: string;
  job: {
    start_date?: string | null;
    timing?: string | null;
    facility?: string | null;
    bill_rate?: number | string | null;
    state?: string | null;
  } | null;
};

export async function fetchCalendarShifts(year: number, month: number): Promise<CalendarShift[]> {
  const response = await professionalApiClient.get<CalendarShift[]>(
    `/per_diem_job_applications/calendar/?year=${year}&month=${month}`,
  );
  if (!response.ok) {
    throw new Error(formatApiFailure(response, 'Unable to load your calendar.'));
  }
  if (!Array.isArray(response.data)) {
    throw new Error('The server returned an invalid calendar response.');
  }
  return response.data;
}
