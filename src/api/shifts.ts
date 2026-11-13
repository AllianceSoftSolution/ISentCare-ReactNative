import { professionalApiClient } from '@/api/apiClient';
import { formatApiFailure } from '@/api/work';

export type TodayShift = {
  id: number;
  shift: number | null;
  start_date: string;
  timing: string;
  position: string;
  facility: string;
  state: string;
  pay_rate: number | string | null;
};

export type PunchInLocation = {
  latitude: number;
  longitude: number;
};

export async function fetchTodayShifts(): Promise<TodayShift[]> {
  const response = await professionalApiClient.get<{ results?: TodayShift[] }>(
    '/per_diem_job_applications/todayShifts/',
  );
  if (!response.ok) {
    throw new Error(formatApiFailure(response, 'Unable to load today’s shifts.'));
  }
  if (!response.data || !Array.isArray(response.data.results)) {
    throw new Error('The server returned an invalid list of today’s shifts.');
  }
  return response.data.results;
}

export async function punchIn(applicationId: number, location: PunchInLocation): Promise<number> {
  const response = await professionalApiClient.post<{ id?: number }>(
    '/shifts/punch_in/',
    {
      application: applicationId,
      latitude: location.latitude,
      longitude: location.longitude,
    },
  );
  if (!response.ok) {
    const error = new Error(
      formatApiFailure(response, 'Unable to start your shift.'),
    ) as Error & { status?: number };
    if (typeof response.status === 'number') error.status = response.status;
    throw error;
  }
  const shiftId = response.data?.id;
  if (!Number.isInteger(shiftId) || !shiftId || shiftId < 1) {
    throw new Error('The server did not confirm that your shift started. Refresh and check its status.');
  }
  return shiftId;
}

export async function punchOut(
  shiftId: number,
  location: PunchInLocation,
  tookBreak = true,
): Promise<void> {
  const response = await professionalApiClient.patch(
    `/shifts/${shiftId}/punch_out/`,
    {
      latitude: location.latitude,
      longitude: location.longitude,
      took_break: tookBreak,
    },
  );
  if (!response.ok) {
    const error = new Error(
      formatApiFailure(response, 'Unable to end your shift.'),
    ) as Error & { status?: number };
    if (typeof response.status === 'number') error.status = response.status;
    throw error;
  }
}
