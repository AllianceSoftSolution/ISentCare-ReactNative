import apiClient, { professionalApiClient } from '@/api/apiClient';
import { formatApiFailure } from '@/api/work';
import { appendUploadAsync, multipartRequestConfig, type SelectedUpload } from '@/utils/upload';

export type NotificationPreferences = {
  id: number;
  application_status: boolean;
  upcoming_shift: boolean;
  new_job: boolean;
};

export type UserAddress = {
  id: number;
  address: string;
  city: string;
  zip_code: string;
  state: number | { id?: number; name?: string } | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

export type AccountProfile = {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  dp?: string | null;
  address?: UserAddress | Record<string, never> | null;
};

function responseError(
  response: { status?: number; problem?: string | null; data?: unknown },
  fallback: string,
) {
  return formatApiFailure(response, fallback);
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  return fallback;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function fetchAccountProfile(): Promise<AccountProfile> {
  const response = await apiClient.get<AccountProfile>('/users/my_profile/');
  if (!response.ok) {
    throw new Error(responseError(response, 'Unable to load your account.'));
  }
  if (!response.data || typeof response.data.id !== 'number') {
    throw new Error('The server returned an invalid account profile.');
  }
  return response.data;
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await professionalApiClient.get<NotificationPreferences | NotificationPreferences[]>(
    '/notifications/',
  );
  if (!response.ok) {
    throw new Error(responseError(response, 'Unable to load notification preferences.'));
  }

  const raw = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!raw || typeof raw.id !== 'number') {
    throw new Error('The server returned invalid notification preferences.');
  }

  return {
    id: raw.id,
    application_status: asBoolean(raw.application_status, true),
    upcoming_shift: asBoolean(raw.upcoming_shift, true),
    new_job: asBoolean(raw.new_job, true),
  };
}

export async function updateNotificationPreference(
  current: NotificationPreferences,
  key: keyof Omit<NotificationPreferences, 'id'>,
  value: boolean,
): Promise<NotificationPreferences> {
  const response = await professionalApiClient.patch<NotificationPreferences>(
    `/notifications/${current.id}/`,
    { [key]: value },
  );
  if (!response.ok) {
    throw new Error(responseError(response, 'Unable to update notification preferences.'));
  }
  const data = response.data;
  return {
    id: typeof data?.id === 'number' ? data.id : current.id,
    application_status: asBoolean(
      data?.application_status,
      key === 'application_status' ? value : current.application_status,
    ),
    upcoming_shift: asBoolean(
      data?.upcoming_shift,
      key === 'upcoming_shift' ? value : current.upcoming_shift,
    ),
    new_job: asBoolean(
      data?.new_job,
      key === 'new_job' ? value : current.new_job,
    ),
  };
}

export async function updatePassword(userId: number, password: string): Promise<void> {
  const response = await apiClient.patch(`/users/${userId}/`, { password });
  if (!response.ok) {
    throw new Error(responseError(response, 'Unable to update your password.'));
  }
}

export async function updateProfilePhoto(userId: number, photo: SelectedUpload): Promise<void> {
  const formData = new FormData();
  await appendUploadAsync(formData, 'dp', photo);
  const response = await apiClient.patch(`/users/${userId}/`, formData, multipartRequestConfig);
  if (!response.ok) {
    throw new Error(responseError(response, 'Unable to update your profile photo.'));
  }
}

export function normalizeAddressStateId(state: UserAddress['state']): number | null {
  if (typeof state === 'number' && Number.isFinite(state)) return state;
  if (state && typeof state === 'object' && typeof state.id === 'number') return state.id;
  return asNumber(state);
}

export async function updateAddress(
  addressId: number,
  payload: {
    address: string;
    city: string;
    state: number;
    zip_code: string;
    latitude: number;
    longitude: number;
  },
): Promise<void> {
  const response = await professionalApiClient.patch(`/address/${addressId}/`, payload);
  if (!response.ok) {
    throw new Error(responseError(response, 'Unable to update your address.'));
  }
}

export function readAddressCoordinates(address?: UserAddress | null): {
  latitude: number | null;
  longitude: number | null;
} {
  return {
    latitude: asNumber(address?.latitude),
    longitude: asNumber(address?.longitude),
  };
}
