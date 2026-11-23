import apiClient, { setAuthToken } from './apiClient';
import useAuthStore from '@/store/authStore';
import { phoneDigits } from '@/utils/phone';
import { appendUploadAsync, type SelectedUpload } from '@/utils/upload';

export type LoginResult = {
  access?: string;
  refresh?: string;
  blocked?: boolean;
  details?: string;
  detail?: string;
  user?: {
    verified?: boolean | null;
  };
};

export class LoginError extends Error {
  constructor(
    message: string,
    readonly blocked = false,
  ) {
    super(message);
    this.name = 'LoginError';
  }
}

export type RegisterPayload = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
  dob: string;
  ssn: string;
  address: string;
  city: string;
  state: number;
  zip_code: string;
  latitude: number;
  longitude: number;
  type: string;
  title: string;
  per_diem: boolean;
  fix_time?: boolean;
  tra_assign?: boolean;
  per_place?: boolean;
};

export class RegisterError extends Error {
  constructor(
    message: string,
    readonly fields: Partial<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'RegisterError';
  }
}

function fieldMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0];
  }
  return null;
}

function responseError(data: unknown, fallback: string): string {
  if (typeof data === 'string') {
    const trimmed = data.trim().toLowerCase();
    if (
      trimmed.startsWith('<!doctype html')
      || trimmed.startsWith('<html')
      || trimmed.includes('<head>')
    ) {
      return fallback;
    }
    if (data.trim()) return data.trim();
  }
  if (data && typeof data === 'object') {
    const body = data as Record<string, unknown>;
    for (const key of [
      'details',
      'detail',
      'message',
      'email',
      'phone',
      'code',
      'token',
      'password',
      'confirm_password',
      'non-field-error',
      'non_field_errors',
    ]) {
      const message = fieldMessage(body[key]);
      if (message) return message;
    }
  }
  return fallback;
}

function responseFieldErrors(data: unknown): Partial<Record<string, string>> {
  if (!data || typeof data !== 'object') return {};
  const body = data as Record<string, unknown>;
  const fields: Partial<Record<string, string>> = {};
  for (const [key, value] of Object.entries(body)) {
    const message = fieldMessage(value);
    if (message) fields[key] = message;
  }
  return fields;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  // Ensure login is a clean unauthenticated JWT request (avoids CSRF from stale sessions).
  // Do not mark sessionStatus as signedOut here — that soft-locks restoreSession when a
  // prior accessToken is still in secure storage and login fails.
  setAuthToken(null);
  useAuthStore.getState().setToken(null);
  useAuthStore.getState().setSessionStatus('unknown');

  const response = await apiClient.post('/users/login/', {
    email: email.trim(),
    // Keep password exactly as entered so it matches registration (which does not trim).
    password,
  });

  const data = (response.data ?? {}) as LoginResult;

  if (!response.ok) {
    throw new LoginError(
      responseError(
        response.data,
        response.status ? `Login failed (${response.status}).` : 'Login failed.',
      ),
      data.blocked === true,
    );
  }

  return data as LoginResult;
}

export async function requestSignupOtp(email: string, phone?: string): Promise<void> {
  const payload: { email: string; phone?: string } = { email: email.trim() };
  const digits = phoneDigits(phone || '');
  if (digits) payload.phone = digits;

  const response = await apiClient.post('/users/signup_otp/', payload);
  if (!response.ok) {
    throw new RegisterError(
      responseError(response.data, 'Could not send the verification code.'),
      responseFieldErrors(response.data),
    );
  }
}

export async function verifySignupOtp(email: string, code: string): Promise<LoginResult> {
  const response = await apiClient.post<LoginResult>(
    '/users/verify_signup_otp/',
    { email: email.trim(), code: code.trim() },
  );
  if (!response.ok) {
    throw new Error(responseError(response.data, 'That verification code is not valid.'));
  }
  const data = (response.data ?? {}) as LoginResult;
  if (!data.access) {
    throw new Error('The server did not return an access token after email verification.');
  }
  return data;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const response = await apiClient.post('/password_reset/', { email: email.trim() });
  if (!response.ok) {
    throw new Error(responseError(response.data, 'Could not send the password reset email.'));
  }
}

export async function confirmPasswordReset(
  token: string,
  password: string,
  confirmPassword: string,
): Promise<void> {
  const response = await apiClient.post('/password_reset/confirm/', {
    token: token.trim(),
    password,
    confirm_password: confirmPassword,
  });
  if (!response.ok) {
    throw new Error(responseError(response.data, 'Could not reset your password.'));
  }
}

export async function register(
  payload: RegisterPayload,
  idImage?: SelectedUpload | null,
): Promise<LoginResult & { needs_email_verification?: boolean }> {
  const formData = new FormData();
  Object.entries({
    ...payload,
    // Explicit false flags keep DRF boolean parsing predictable for multipart.
    fix_time: payload.fix_time ?? false,
    tra_assign: payload.tra_assign ?? false,
    per_place: payload.per_place ?? false,
  }).forEach(([key, value]) => {
    formData.append(key, String(value));
  });
  // Do not send app=1 here. Self-service professionals must be created inactive
  // so signup_otp can email them; app=1 marks the account active immediately.
  if (idImage) {
    await appendUploadAsync(formData, 'dp', idImage);
  }

  const response = await apiClient.post('/users/', formData);

  const data = (response.data ?? {}) as LoginResult & { needs_email_verification?: boolean };
  const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? {});

  if (!response.ok) {
    const message = responseError(
      response.data,
      raw ? `${response.status}: ${raw}` : `Registration failed (${response.status}).`,
    );
    throw new RegisterError(message, responseFieldErrors(response.data));
  }

  return data;
}
