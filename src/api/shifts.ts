import { professionalApiClient } from '@/api/apiClient';
import { formatApiFailure } from '@/api/work';

export type TodayShift = {
  id: number;
  shift: number | null;
  /** ISO timestamp from the server when the shift was punched in. */
  punch_in?: string | null;
  start_date: string;
  timing: string;
  position: string;
  facility: string;
  state: string;
  pay_rate: number | string | null;
};

/** Matches Shift.calculate_duration(): break only applies at/after 30 minutes. */
export const BREAK_DEDUCTION_MIN_MS = 30 * 60 * 1000;

export function isBreakDeductionEligible(
  shift: Pick<TodayShift, 'punch_in'>,
  localPunchInAtMs?: number | null,
  nowMs: number = Date.now(),
): boolean {
  const fromServer = typeof shift.punch_in === 'string' ? Date.parse(shift.punch_in) : Number.NaN;
  const startMs = Number.isFinite(fromServer)
    ? fromServer
    : typeof localPunchInAtMs === 'number' && Number.isFinite(localPunchInAtMs)
      ? localPunchInAtMs
      : null;
  // Fail closed: without a known punch-in time, do not offer/claim a break deduction.
  if (startMs === null) return false;
  return nowMs - startMs >= BREAK_DEDUCTION_MIN_MS;
}

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
