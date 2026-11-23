const mockPost = jest.fn();
const mockSetAuthToken = jest.fn();

jest.mock('@/api/apiClient', () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => mockPost(...args) },
  setAuthToken: (...args: unknown[]) => mockSetAuthToken(...args),
}));

import { login, LoginError } from '@/api/auth';
import useAuthStore from '@/store/authStore';

describe('login soft-lock guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ token: 'stale', sessionStatus: 'verified' });
  });

  test('clears in-memory token without marking signedOut', async () => {
    mockPost.mockResolvedValue({
      ok: false,
      status: 400,
      data: { detail: 'No user matching these credentials.' },
    });

    await expect(login('a@b.com', 'bad')).rejects.toBeInstanceOf(LoginError);
    expect(mockSetAuthToken).toHaveBeenCalledWith(null);
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().sessionStatus).toBe('unknown');
  });

  test('successful login leaves status for restoreSession to set', async () => {
    mockPost.mockResolvedValue({
      ok: true,
      data: { access: 'new', refresh: 'r' },
    });
    const result = await login('a@b.com', 'good');
    expect(result.access).toBe('new');
    expect(useAuthStore.getState().sessionStatus).toBe('unknown');
  });
});
