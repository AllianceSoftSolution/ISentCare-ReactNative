jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: '/cache/',
  EncodingType: { Base64: 'base64' },
  writeAsStringAsync: jest.fn(),
  getContentUriAsync: jest.fn(),
}));

jest.mock('@/api/apiClient', () => ({
  apiOrigin: 'https://isentcare.com',
}));

jest.mock('@/store/authStore', () => ({
  authStore: { getState: () => ({ token: 'tok' }) },
}));

import {
  extensionForDownloadedDocument,
  isSecureFileUrl,
} from '@/utils/openSecureDocument';

describe('isSecureFileUrl', () => {
  test('accepts absolute and relative /files/secure links', () => {
    expect(isSecureFileUrl('https://isentcare.com/files/secure/?t=abc')).toBe(true);
    expect(isSecureFileUrl('/files/secure/?t=abc')).toBe(true);
  });

  test('rejects raw storage and media URLs', () => {
    expect(isSecureFileUrl('https://bucket.s3.amazonaws.com/private/doc.pdf')).toBe(false);
    expect(isSecureFileUrl('https://isentcare.com/media/doc.pdf')).toBe(false);
  });
});

describe('extensionForDownloadedDocument', () => {
  test('uses Content-Disposition filename when present', () => {
    const buffer = new ArrayBuffer(8);
    expect(
      extensionForDownloadedDocument(
        buffer,
        'application/octet-stream',
        'inline; filename="resume.pdf"',
      ),
    ).toBe('pdf');
  });

  test('sniffs PDF magic bytes when headers are useless', () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    expect(
      extensionForDownloadedDocument(
        bytes.buffer,
        'application/octet-stream',
        null,
      ),
    ).toBe('pdf');
  });

  test('sniffs JPEG magic bytes', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    expect(
      extensionForDownloadedDocument(bytes.buffer, 'application/octet-stream', null),
    ).toBe('jpg');
  });
});
