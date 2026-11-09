import apiClient from './apiClient';
import { appendUpload, type SelectedUpload } from '@/utils/upload';

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
  email_verification_token: string;
};

function responseError(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const body = data as Record<string, unknown>;
    for (const key of [
      'details',
      'detail',
      'message',
      'email',
      'code',
      'token',
      'password',
      'confirm_password',
      'email_verification_token',
    ]) {
      const value = body[key];
      if (typeof value === 'string') return value;
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    }
  }
  return fallback;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const response = await apiClient.post('/users/login/', {
    email: email.trim(),
    password: password.trim(),
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

export async function requestSignupOtp(email: string): Promise<void> {
  const response = await apiClient.post('/users/signup_otp/', { email: email.trim() });
  if (!response.ok) {
    throw new Error(responseError(response.data, 'Could not send the verification code.'));
  }
}

export async function verifySignupOtp(email: string, code: string): Promise<string> {
  const response = await apiClient.post<{ email_verification_token?: string }>(
    '/users/verify_signup_otp/',
    { email: email.trim(), code: code.trim() },
  );
  if (!response.ok) {
    throw new Error(responseError(response.data, 'That verification code is not valid.'));
  }
  const token = response.data?.email_verification_token;
  if (!token) throw new Error('The server did not return an email verification token.');
  return token;
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
): Promise<LoginResult> {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    formData.append(key, String(value));
  });
  if (idImage) {
    appendUpload(formData, 'dp', idImage);
  }

  const response = await apiClient.post('/users/', formData);

  const data = (response.data ?? {}) as LoginResult;
  const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? {});

  if (!response.ok) {
    const message = responseError(
      response.data,
      raw ? `${response.status}: ${raw}` : `Registration failed (${response.status}).`,
    );
    throw new Error(message);
  }

  return data as LoginResult;
}
