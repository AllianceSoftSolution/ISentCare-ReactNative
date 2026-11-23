import apiClient, { setAuthToken } from '@/api/apiClient';
import type { LoginResult } from '@/api/auth';
import { formatApiFailure } from '@/api/work';
import useAuthStore, { type SessionStatus } from '@/store/authStore';
import { deleteStorageItem, getStorageItem, setStorageItem } from '@/utils/storage';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const LEGACY_ACCESS_TOKEN_KEY = 'access_token';
const LEGACY_REFRESH_TOKEN_KEY = 'refresh_token';

function responseError(
  response: { status?: number; problem?: string; data?: unknown },
  fallback: string,
) {
  return formatApiFailure(response, fallback);
}

async function readAccessToken() {
  const token = await getStorageItem(ACCESS_TOKEN_KEY);
  if (token) return token;

  const legacyToken = await getStorageItem(LEGACY_ACCESS_TOKEN_KEY);
  if (!legacyToken) return null;

  await setStorageItem(ACCESS_TOKEN_KEY, legacyToken);
  await deleteStorageItem(LEGACY_ACCESS_TOKEN_KEY);
  const legacyRefreshToken = await getStorageItem(LEGACY_REFRESH_TOKEN_KEY);
  if (legacyRefreshToken) {
    await setStorageItem(REFRESH_TOKEN_KEY, legacyRefreshToken);
    await deleteStorageItem(LEGACY_REFRESH_TOKEN_KEY);
  }
  return legacyToken;
}

export async function saveSessionTokens(tokens: LoginResult) {
  if (!tokens.access) {
    throw new Error('The server did not return an access token.');
  }

  await setStorageItem(ACCESS_TOKEN_KEY, tokens.access);
  if (tokens.refresh) {
    await setStorageItem(REFRESH_TOKEN_KEY, tokens.refresh);
  } else {
    await deleteStorageItem(REFRESH_TOKEN_KEY);
  }
  await deleteStorageItem(LEGACY_ACCESS_TOKEN_KEY);
  await deleteStorageItem(LEGACY_REFRESH_TOKEN_KEY);

  const store = useAuthStore.getState();
  store.setToken(tokens.access);
  store.setSessionStatus('unknown');
  setAuthToken(tokens.access);
}

export async function clearSession() {
  await Promise.all([
    deleteStorageItem(ACCESS_TOKEN_KEY),
    deleteStorageItem(REFRESH_TOKEN_KEY),
    deleteStorageItem(LEGACY_ACCESS_TOKEN_KEY),
    deleteStorageItem(LEGACY_REFRESH_TOKEN_KEY),
  ]);
  useAuthStore.getState().logout();
  setAuthToken(null);
  // Drop in-memory caches so the next account cannot see prior data.
  // Catch import failures (e.g. Jest without ESM dynamic import) so sign-out still completes.
  void import('@/store/profileRecordsCache')
    .then(({ invalidateProfileRecordsCache }) => {
      invalidateProfileRecordsCache();
    })
    .catch(() => undefined);
  void import('@/store/accountSettingsCache')
    .then(({ invalidateAccountSettingsCache }) => {
      invalidateAccountSettingsCache();
    })
    .catch(() => undefined);
  void import('@/store/workListCache')
    .then(({ invalidateWorkListCache }) => {
      invalidateWorkListCache();
    })
    .catch(() => undefined);
  void import('@/store/notificationBadgeStore')
    .then((mod) => {
      mod.default.getState().setCount(0);
    })
    .catch(() => undefined);
}

export async function restoreSession(force = false): Promise<SessionStatus> {
  const store = useAuthStore.getState();
  if (
    !force &&
    (store.sessionStatus === 'verified' ||
      store.sessionStatus === 'incomplete' ||
      store.sessionStatus === 'pending')
  ) {
    return store.sessionStatus;
  }

  // Never trust a cached signedOut without re-reading secure storage — login()
  // may clear the in-memory token while a prior accessToken is still on disk.
  store.setSessionStatus('checking');
  try {
    const token = await readAccessToken();
    if (!token) {
      useAuthStore.getState().logout();
      return 'signedOut';
    }

    useAuthStore.getState().setToken(token);
    setAuthToken(token);
    const response = await apiClient.get<{ verified?: unknown }>('/users/my_profile/');
    if (!response.ok) {
      // Only a true auth failure should wipe credentials. Gateway/5xx HTML pages
      // must not sign the professional out.
      if (response.status === 401) {
        await clearSession();
        return 'signedOut';
      }
      throw new Error(responseError(response, 'Unable to verify your account status.'));
    }

    const verified = response.data?.verified;
    if (verified !== true && verified !== false && verified !== null) {
      throw new Error('The server returned an invalid account verification status.');
    }

    const status = verified ? 'verified' : verified === false ? 'pending' : 'incomplete';
    useAuthStore.getState().setSessionStatus(status);
    return status;
  } catch (error) {
    useAuthStore.getState().setSessionStatus('error');
    throw error;
  }
}
