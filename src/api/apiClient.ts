import { create } from 'apisauce';
import useAuthStore from '../store/authStore';

const DEFAULT_BASE_URL = 'https://app.rustumdynamic.com/api/';
const baseURL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_BASE_URL) ||
  DEFAULT_BASE_URL;

const apiClient = create({ baseURL });

apiClient.addRequestTransform((request) => {
  const authToken = useAuthStore.getState().token;
  if (!authToken) return;
  request.headers = request.headers || {};
  request.headers.authorization = 'Bearer ' + authToken;
});

apiClient.addResponseTransform((response) => {
  if (response.status === 401) {
    const { token, logout } = useAuthStore.getState();
    if (token) {
      logout();
    }
  }
});

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

export { setAuthToken, baseURL };
export default apiClient;