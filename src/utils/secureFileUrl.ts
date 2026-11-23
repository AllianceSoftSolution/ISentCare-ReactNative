import { apiOrigin } from '@/api/apiClient';
import { authStore } from '@/store/authStore';

/**
 * Build an absolute file URL and, for /files/secure/ links, attach the JWT
 * as ?access= so Image / WebBrowser can load it (no Django session cookie).
 */
export function secureFileUrl(path: string | null | undefined, token?: string | null): string {
  if (!path) return '';
  const absolute = /^https?:\/\//i.test(path)
    ? path
    : `${apiOrigin}${path.startsWith('/') ? '' : '/'}${path}`;

  const authToken = token ?? authStore.getState().token;
  if (!authToken) return absolute;

  try {
    const url = new URL(absolute);
    if (!url.pathname.includes('/files/secure')) return absolute;
    url.searchParams.set('access', authToken);
    return url.toString();
  } catch {
    return absolute;
  }
}
