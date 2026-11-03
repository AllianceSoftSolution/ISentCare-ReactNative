import apiClient from './apiClient';

export type LoginResult = {
  access?: string;
  refresh?: string;
  details?: string;
  detail?: string;
};

export async function login(email: string, password: string): Promise<LoginResult> {
  const response = await apiClient.post('/users/login/', {
    email: email.trim(),
    password: password.trim(),
  });

  const data = (response.data ?? {}) as LoginResult & { [key: string]: unknown };
  const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? {});

  if (!response.ok) {
    const message =
      (typeof data?.details === 'string' && data.details) ||
      (typeof data?.detail === 'string' && data.detail) ||
      (raw ? `${response.status}: ${raw}` : `Login failed (${response.status}).`);
    throw new Error(message);
  }

  return data as LoginResult;
}