import { create } from 'apisauce';
import useAuthStore from '../store/authStore';

const DEFAULT_BASE_URL = 'https://sales-screenshots-wholesale-pipes.trycloudflare.com   ';
const configuredBaseURL = (
  (typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_API_BASE_URL : undefined) ||
  DEFAULT_BASE_URL
)
  .trim()
  .replace(/\/+$/, '');
const apiOrigin = configuredBaseURL.replace(/\/api$/, '');
const baseURL = `${apiOrigin}/api`;

const apiClient = create({ baseURL });
const professionalApiClient = create({ baseURL: `${apiOrigin}/professional/api` });

for (const client of [apiClient, professionalApiClient]) {
  client.addRequestTransform((request) => {
    const authToken = useAuthStore.getState().token;
    if (!authToken) return;
    request.headers = request.headers || {};
    request.headers.authorization = 'Bearer ' + authToken;
  });

  client.addResponseTransform((response) => {
    if (response.status === 401) {
      const { token, logout } = useAuthStore.getState();
      if (token) {
        logout();
      }
    }
  });
}

function setAuthToken(token: string | null) {
  if (token) {
    apiClient.setHeader('authorization', `Bearer ${token}`);
  } else {
    apiClient.deleteHeader('authorization');
  }
}

export const getAllUsers = async () => {
  return await apiClient.get('/auth/users');
};

export { apiOrigin, baseURL, professionalApiClient, setAuthToken };
export default apiClient;