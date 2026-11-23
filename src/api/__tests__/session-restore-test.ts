/**
 * Integration-style tests for restoreSession auth vs HTML/gateway failures.
 * Storage and API client are mocked; auth store is real.
 */

const mockGet = jest.fn();
const mockGetStorageItem = jest.fn();
const mockSetStorageItem = jest.fn();
const mockDeleteStorageItem = jest.fn();
const mockSetAuthToken = jest.fn();

jest.mock('@/api/apiClient', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockGet(...args) },
  setAuthToken: (...args: unknown[]) => mockSetAuthToken(...args),
}));

jest.mock('@/utils/storage', () => ({
  getStorageItem: (...args: unknown[]) => mockGetStorageItem(...args),
  setStorageItem: (...args: unknown[]) => mockSetStorageItem(...args),
  deleteStorageItem: (...args: unknown[]) => mockDeleteStorageItem(...args),
}));

import { clearSession, restoreSession, saveSessionTokens } from '@/api/session';
import useAuthStore from '@/store/authStore';

describe('restoreSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ token: null, sessionStatus: 'unknown' });
    mockDeleteStorageItem.mockResolvedValue(undefined);
    mockSetStorageItem.mockResolvedValue(undefined);
  });

  test('returns signedOut when no token is stored', async () => {
    mockGetStorageItem.mockResolvedValue(null);
    await expect(restoreSession(true)).resolves.toBe('signedOut');
    expect(useAuthStore.getState().sessionStatus).toBe('signedOut');
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('returns verified when profile says verified', async () => {
    mockGetStorageItem.mockImplementation(async (key: string) =>
      key === 'accessToken' ? 'tok' : null,
    );
    mockGet.mockResolvedValue({ ok: true, data: { verified: true } });
    await expect(restoreSession(true)).resolves.toBe('verified');
    expect(useAuthStore.getState().token).toBe('tok');
  });

  test('returns pending when verified is false', async () => {
    mockGetStorageItem.mockImplementation(async (key: string) =>
      key === 'accessToken' ? 'tok' : null,
    );
    mockGet.mockResolvedValue({ ok: true, data: { verified: false } });
    await expect(restoreSession(true)).resolves.toBe('pending');
  });

  test('returns incomplete when verified is null', async () => {
    mockGetStorageItem.mockImplementation(async (key: string) =>
      key === 'accessToken' ? 'tok' : null,
    );
    mockGet.mockResolvedValue({ ok: true, data: { verified: null } });
    await expect(restoreSession(true)).resolves.toBe('incomplete');
  });

  test('clears session only on HTTP 401', async () => {
    mockGetStorageItem.mockImplementation(async (key: string) =>
      key === 'accessToken' ? 'tok' : null,
    );
    mockGet.mockResolvedValue({
      ok: false,
      status: 401,
      data: { detail: 'Authentication credentials were not provided.' },
    });
    await expect(restoreSession(true)).resolves.toBe('signedOut');
    expect(mockDeleteStorageItem).toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBeNull();
  });

  test('does not clear session on HTML 502 gateway page', async () => {
    mockGetStorageItem.mockImplementation(async (key: string) =>
      key === 'accessToken' ? 'tok' : null,
    );
    mockGet.mockResolvedValue({
      ok: false,
      status: 502,
      problem: 'SERVER_ERROR',
      data: '<!DOCTYPE html><html><head></head><body>Bad Gateway</body></html>',
    });
    await expect(restoreSession(true)).rejects.toThrow(/unexpected response|Unable to verify/i);
    expect(useAuthStore.getState().token).toBe('tok');
    expect(useAuthStore.getState().sessionStatus).toBe('error');
    // clearSession deletes several keys — must not run for HTML/5xx
    expect(mockDeleteStorageItem).not.toHaveBeenCalled();
  });

  test('re-reads secure storage even when in-memory status is signedOut', async () => {
    useAuthStore.setState({ token: null, sessionStatus: 'signedOut' });
    mockGetStorageItem.mockImplementation(async (key: string) =>
      key === 'accessToken' ? 'still-on-disk' : null,
    );
    mockGet.mockResolvedValue({ ok: true, data: { verified: true } });
    await expect(restoreSession()).resolves.toBe('verified');
    expect(mockGetStorageItem).toHaveBeenCalled();
  });
});

describe('saveSessionTokens + restoreSession after login soft-lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ token: null, sessionStatus: 'unknown' });
    mockDeleteStorageItem.mockResolvedValue(undefined);
    mockSetStorageItem.mockResolvedValue(undefined);
  });

  test('login clearing in-memory token does not block restore when disk has token', async () => {
    // Simulate failed login soft-clear (token null, status unknown — not signedOut).
    useAuthStore.setState({ token: null, sessionStatus: 'unknown' });
    mockGetStorageItem.mockImplementation(async (key: string) =>
      key === 'accessToken' ? 'prior-token' : null,
    );
    mockGet.mockResolvedValue({ ok: true, data: { verified: true } });
    await expect(restoreSession()).resolves.toBe('verified');
  });

  test('saveSessionTokens stores access and marks status unknown', async () => {
    await saveSessionTokens({ access: 'new-access', refresh: 'new-refresh' });
    expect(mockSetStorageItem).toHaveBeenCalledWith('accessToken', 'new-access');
    expect(useAuthStore.getState().token).toBe('new-access');
    expect(useAuthStore.getState().sessionStatus).toBe('unknown');
  });
});

describe('clearSession', () => {
  test('clears tokens and marks signedOut', async () => {
    useAuthStore.setState({ token: 'tok', sessionStatus: 'verified' });
    mockDeleteStorageItem.mockResolvedValue(undefined);
    await clearSession();
    expect(useAuthStore.getState()).toMatchObject({ token: null, sessionStatus: 'signedOut' });
    expect(mockSetAuthToken).toHaveBeenCalledWith(null);
  });
});
