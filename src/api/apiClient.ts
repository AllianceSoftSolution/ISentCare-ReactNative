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

// Keep cookie credentials off so Django SessionAuthentication cannot
// enforce CSRF on JWT/API requests from the mobile/web clients.
const apiClient = create({ baseURL, withCredentials: false });
const professionalApiClient = create({
  baseURL: `${apiOrigin}/professional/api`,
  withCredentials: false,
});

for (const client of [apiClient, professionalApiClient]) {
  client.addRequestTransform((request) => {
    request.headers = request.headers || {};
    const authToken = useAuthStore.getState().token;
    if (authToken) {
      request.headers.authorization = 'Bearer ' + authToken;
    } else if (request.headers.authorization) {
      delete request.headers.authorization;
    }
  });

  client.addResponseTransform((response) => {
    if (response.status === 401) {
      const { token } = useAuthStore.getState();
      if (token) {
        // Dynamic import avoids a circular dependency with session.ts.
        void import('./session').then(({ clearSession }) => clearSession());
      }
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
