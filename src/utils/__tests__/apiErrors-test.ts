import { isAuthFailureStatus, looksLikeHtml } from '@/utils/apiErrors';

describe('looksLikeHtml', () => {
  test('detects common HTML bodies', () => {
    expect(looksLikeHtml('<!DOCTYPE html><html></html>')).toBe(true);
    expect(looksLikeHtml('  <html><head></head></html>')).toBe(true);
    expect(looksLikeHtml({ detail: 'error' })).toBe(false);
    expect(looksLikeHtml('Invalid credentials')).toBe(false);
  });
});

describe('isAuthFailureStatus', () => {
  test('only 401 is treated as auth failure for session wipe', () => {
    expect(isAuthFailureStatus(401)).toBe(true);
    expect(isAuthFailureStatus(403)).toBe(false);
    expect(isAuthFailureStatus(502)).toBe(false);
  });
});
