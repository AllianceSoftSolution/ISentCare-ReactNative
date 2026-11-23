import { apiOrigin } from '@/api/apiClient';
import useAuthStore from '@/store/authStore';
import { secureFileUrl } from '@/utils/secureFileUrl';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

function absoluteFileUrl(path: string) {
  return /^https?:\/\//i.test(path)
    ? path
    : `${apiOrigin}${path.startsWith('/') ? '' : '/'}${path}`;
}

function guessExtension(path: string, mimeType?: string | null) {
  const fromPath = path.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase();
  if (fromPath && fromPath.length <= 5 && /^[a-z0-9]+$/i.test(fromPath)) {
    return fromPath;
  }
  if (mimeType?.includes('pdf')) return 'pdf';
  if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) return 'jpg';
  if (mimeType?.includes('png')) return 'png';
  if (mimeType?.includes('msword')) return 'doc';
  if (mimeType?.includes('wordprocessingml')) return 'docx';
  return 'bin';
}

function mimeFromExtension(ext: string) {
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Download a private /files/secure document with the JWT, then open it via the
 * system share sheet. Avoids in-app browser → web login → CSRF failures.
 */
export async function openSecureDocument(path: string): Promise<void> {
  const token = useAuthStore.getState().token;
  if (!token) {
    throw new Error('Sign in again to open this document.');
  }

  const absolute = absoluteFileUrl(path);
  // Prefer Authorization header; also keep ?access= for servers that only check query.
  const downloadUrl = secureFileUrl(absolute, token);
  const ext = guessExtension(absolute);
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) {
    throw new Error('Unable to save the document on this device.');
  }

  const target = `${cacheRoot}isentcare-doc-${Date.now()}.${ext}`;
  const result = await FileSystem.downloadAsync(downloadUrl, target, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: '*/*',
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(
      result.status === 401 || result.status === 403
        ? 'You do not have access to this document. Sign in again and try once more.'
        : 'Unable to download this document. Please try again.',
    );
  }

  // HTML login/CSRF pages must not be treated as successful downloads.
  const contentType = (result.headers?.['Content-Type'] || result.headers?.['content-type'] || '')
    .toString()
    .toLowerCase();
  if (contentType.includes('text/html')) {
    throw new Error(
      'Unable to open this document securely. Pull to refresh your documents and try again.',
    );
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(
      Platform.OS === 'web'
        ? 'Document sharing is not available in the browser. Use the mobile app.'
        : 'Unable to open documents on this device.',
    );
  }

  await Sharing.shareAsync(result.uri, {
    mimeType: mimeFromExtension(ext),
    dialogTitle: 'Open document',
  });
}
