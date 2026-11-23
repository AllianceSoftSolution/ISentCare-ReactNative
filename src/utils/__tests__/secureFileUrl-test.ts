import { secureFileUrl } from '@/utils/secureFileUrl';

jest.mock('@/api/apiClient', () => ({
  apiOrigin: 'https://isentcare.com',
}));

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  default: {
    getState: () => ({ token: null }),
  },
}));

describe('secureFileUrl', () => {
  test('leaves non-secure URLs unchanged', () => {
    expect(secureFileUrl('https://cdn.example.com/x.jpg', 'tok')).toBe(
      'https://cdn.example.com/x.jpg',
    );
  });

  test('appends JWT access param for /files/secure links', () => {
    const result = secureFileUrl(
      'https://isentcare.com/files/secure/?t=abc',
      'jwt-token',
    );
    expect(result).toContain('t=abc');
    expect(result).toContain('access=jwt-token');
  });

  test('resolves relative paths against api origin', () => {
    expect(secureFileUrl('/files/secure/?t=x', 'tok')).toContain(
      'https://isentcare.com/files/secure/',
    );
  });
});
