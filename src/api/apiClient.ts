import { create } from 'apisauce';
import useAuthStore from '../store/authStore';

const configuredBaseURL = (
  typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_API_BASE_URL : undefined
)
  ?.trim()
  .replace(/\/+$/, '');

if (!configuredBaseURL) {
  throw new Error(
    'EXPO_PUBLIC_API_BASE_URL is not set. Add it to your Expo env (for example in .env or eas.json) before starting the app.',
  );
}

const apiOrigin = configuredBaseURL.replace(/\/api$/, '');
const baseURL = `${apiOrigin}/api`;

// Mobile networks are often slower than desktop; avoid premature TIMEOUT_ERROR.
const API_TIMEOUT_MS = 45_000;

// Keep cookie credentials off so Django SessionAuthentication cannot
// enforce CSRF on JWT/API requests from the mobile/web clients.
const apiClient = create({ baseURL, withCredentials: false, timeout: API_TIMEOUT_MS });
const professionalApiClient = create({
  baseURL: `${apiOrigin}/professional/api`,
  withCredentials: false,
  timeout: API_TIMEOUT_MS,
});

let signingOutForAuth = false;

async function forceSignOutToLogin() {
  if (signingOutForAuth) return;
  signingOutForAuth = true;
  try {
    // Dynamic import avoids a circular dependency with session.ts.
    const { clearSession } = await import('./session');
    await clearSession();
    try {
      // Dynamic import keeps expo-router out of the API module graph at boot.
      const { router } = await import('expo-router');
      router.replace('/(auth)/sign-in');
    } catch {
      // Navigation may be unavailable during early boot; splash/tabs guards will route.
    }
  } finally {
    signingOutForAuth = false;
  }
}

for (const client of [apiClient, professionalApiClient]) {
  client.addRequestTransform((request) => {
    request.headers = request.headers || {};
    // Prefer JSON so DRF does not return the browsable HTML API on errors.
    request.headers.Accept = 'application/json';
    const authToken = useAuthStore.getState().token;
    if (authToken) {
      request.headers.authorization = 'Bearer ' + authToken;
    } else if (request.headers.authorization) {
      delete request.headers.authorization;
    }

    // Apisauce defaults Content-Type to application/json. That turns multipart
    // uploads into a non-file body and Django responds with
    // "The submitted data was not a file. Check the encoding type on the form."
    if (typeof FormData !== 'undefined' && request.data instanceof FormData) {
      delete request.headers['Content-Type'];
      delete request.headers['content-type'];
    }
  });

  client.addResponseTransform((response) => {
    const hadToken = Boolean(useAuthStore.getState().token);
    // Only clear the session on HTTP 401. HTML 403/5xx gateway pages are not
    // proof that the JWT is invalid and must not force sign-out mid-flow.
    if (hadToken && response.status === 401) {
      void forceSignOutToLogin();
    }
  });
}

function setAuthToken(token: string | null) {
  if (token) {
    apiClient.setHeader('authorization', `Bearer ${token}`);
    professionalApiClient.setHeader('authorization', `Bearer ${token}`);
  } else {
    apiClient.deleteHeader('authorization');
    professionalApiClient.deleteHeader('authorization');
  }
}

export const getAllUsers = async () => {
  return await apiClient.get('/auth/users');
};

export { apiOrigin, baseURL, professionalApiClient, setAuthToken };
export default apiClient;
