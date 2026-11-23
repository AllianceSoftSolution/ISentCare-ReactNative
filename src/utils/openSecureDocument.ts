import { apiOrigin } from '@/api/apiClient';
import { authStore } from '@/store/authStore';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { router } from 'expo-router';
import { Platform } from 'react-native';

export type DocumentRef =
  | { kind: 'resume' }
  | { kind: 'attachment'; id: number }
  | { kind: 'other'; id: number }
  | { kind: 'extra'; id: number };

export function isSecureFileUrl(url: string) {
  try {
    return new URL(url).pathname.includes('/files/secure');
  } catch {
    return /\/files\/secure/i.test(url);
  }
}

/** Same auth path as replace/delete — DRF JWT on /professional/api/…/download/ */
function professionalDownloadUrl(ref: DocumentRef): string {
  switch (ref.kind) {
    case 'resume':
      return `${apiOrigin}/professional/api/resume/download/`;
    case 'attachment':
      return `${apiOrigin}/professional/api/attachments/${ref.id}/download/`;
    case 'other':
      return `${apiOrigin}/professional/api/other_attachments/${ref.id}/download/`;
    case 'extra':
      return `${apiOrigin}/professional/api/extra_attachments/${ref.id}/download/`;
  }
}

function guessExtensionFromPath(path: string) {
  const fromPath = path.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase();
  if (fromPath && fromPath.length <= 5 && /^[a-z0-9]+$/i.test(fromPath)) {
    return fromPath;
  }
  return null;
}

function extensionFromContentType(contentType: string) {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  switch (mime) {
    case 'application/pdf':
      return 'pdf';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'application/msword':
      return 'doc';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx';
    default:
      return null;
  }
}

function extensionFromContentDisposition(header: string | null) {
  if (!header) return null;
  // Prefer RFC 5987 filename*= when present.
  const star = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return guessExtensionFromPath(decodeURIComponent(star[1].trim().replace(/"/g, '')));
    } catch {
      // fall through
    }
  }
  const plain = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i.exec(header);
  const raw = (plain?.[1] || plain?.[2] || '').trim().replace(/"/g, '');
  if (!raw) return null;
  try {
    return guessExtensionFromPath(decodeURIComponent(raw));
  } catch {
    return guessExtensionFromPath(raw);
  }
}

/** Detect real type from file bytes when the API sends octet-stream / no extension. */
function sniffExtension(buffer: ArrayBuffer): string | null {
  if (buffer.byteLength < 4) return null;
  const bytes = new Uint8Array(buffer.slice(0, 8));
  // %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'pdf';
  }
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png';
  }
  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
  // OLE Compound File (legacy .doc)
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return 'doc';
  }
  // ZIP container — credentials are almost always .docx (not raw .zip)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'docx';
  return null;
}

function resolveExtension(
  buffer: ArrayBuffer,
  contentType: string,
  contentDisposition: string | null,
): string {
  return (
    extensionFromContentDisposition(contentDisposition)
    || extensionFromContentType(contentType)
    || sniffExtension(buffer)
    || 'pdf'
  );
}

function resolveMimeType(contentType: string, ext: string): string {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  if (mime && mime !== 'application/octet-stream' && mime !== 'binary/octet-stream') {
    return mime;
  }
  return mimeFromExtension(ext);
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
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return 'application/octet-stream';
  }
}

/** Exported for tests — resolve cache filename extension from headers + bytes. */
export function extensionForDownloadedDocument(
  buffer: ArrayBuffer,
  contentType: string,
  contentDisposition: string | null,
): string {
  return resolveExtension(buffer, contentType, contentDisposition);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j += 1) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

function messageForFailedDownload(status: number, bodyText: string) {
  const lower = bodyText.toLowerCase();
  if (lower.includes('expired')) {
    return 'This document link has expired. Pull to refresh your documents list and try again.';
  }
  if (
    lower.includes('another account')
    || lower.includes('not allowed')
    || lower.includes('do not have access')
    || lower.includes('private file')
  ) {
    return 'You do not have access to this document. Sign out, sign back in, open Attachments again, then try once more.';
  }
  if (status === 401 || status === 403) {
    return 'You do not have access to this document. Sign in again and try once more.';
  }
  if (status === 404) {
    return 'This document was replaced or removed. Leave Attachments and open it again.';
  }
  return 'Unable to download this document. Please try again.';
}

function filenameFromDisposition(header: string | null, ext: string) {
  if (header) {
    const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(header);
    if (match?.[1]) {
      return decodeURIComponent(match[1].replace(/"/g, '').trim()) || `document.${ext}`;
    }
  }
  return `document.${ext}`;
}

async function fetchAuthorizedFile(url: string): Promise<{
  buffer: ArrayBuffer;
  contentType: string;
  contentDisposition: string | null;
}> {
  const token = authStore.getState().token;
  if (!token) {
    throw new Error('Sign in again to open this document.');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: '*/*',
      },
    });
  } catch {
    throw new Error('Unable to reach IsentCare to download this document. Check your connection.');
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(messageForFailedDownload(response.status, bodyText));
  }

  if (contentType.includes('text/html')) {
    throw new Error('You do not have access to this document. Sign in again and try once more.');
  }

  return {
    buffer: await response.arrayBuffer(),
    contentType,
    contentDisposition: response.headers.get('content-disposition'),
  };
}

type CachedDocument = {
  uri: string;
  mimeType: string;
  ext: string;
};

async function saveBufferToCache(
  buffer: ArrayBuffer,
  contentType: string,
  contentDisposition: string | null,
): Promise<CachedDocument> {
  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) {
    throw new Error('Unable to prepare this document on your device. Restart the app and try again.');
  }

  const ext = resolveExtension(buffer, contentType, contentDisposition);
  const mimeType = resolveMimeType(contentType, ext);
  const target = `${cacheRoot}isentcare-doc-${Date.now()}.${ext}`;

  await FileSystem.writeAsStringAsync(target, arrayBufferToBase64(buffer), {
    encoding: FileSystem.EncodingType.Base64,
  });

  return { uri: target, mimeType, ext };
}

async function openBufferOnWeb(
  buffer: ArrayBuffer,
  contentType: string,
  contentDisposition: string | null,
): Promise<void> {
  const ext = resolveExtension(buffer, contentType, contentDisposition);
  const mime = resolveMimeType(contentType, ext);
  const blob = new Blob([buffer], { type: mime });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  if (!mime.startsWith('image/') && mime !== 'application/pdf') {
    link.download = filenameFromDisposition(contentDisposition, ext);
  }
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/** Android: system document viewer (ACTION_VIEW) — not the share sheet. */
async function openCachedOnAndroid(file: CachedDocument): Promise<void> {
  const contentUri = await FileSystem.getContentUriAsync(file.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: file.mimeType,
  });
}

/** iOS (+ Android fallback): in-app viewer screen — no share sheet. */
function openCachedInAppViewer(file: CachedDocument): void {
  router.push({
    pathname: '/document-viewer',
    params: {
      uri: file.uri,
      mimeType: file.mimeType,
    },
  });
}

/**
 * Download via /professional/api/…/download/ (JWT Bearer) and open for viewing.
 * Android APK → system viewer; iOS → in-app viewer. Never uses the share sheet.
 */
export async function openProfessionalDocument(ref: DocumentRef): Promise<void> {
  const { buffer, contentType, contentDisposition } = await fetchAuthorizedFile(
    professionalDownloadUrl(ref),
  );

  if (Platform.OS === 'web') {
    await openBufferOnWeb(buffer, contentType, contentDisposition);
    return;
  }

  const file = await saveBufferToCache(buffer, contentType, contentDisposition);

  if (Platform.OS === 'android') {
    try {
      await openCachedOnAndroid(file);
      return;
    } catch {
      // No installed handler for this MIME type — fall back to in-app viewer.
    }
  }

  openCachedInAppViewer(file);
}
