import { formatApiFailure, networkReachabilityMessage } from '@/api/work';

describe('formatApiFailure', () => {
  test('maps network problems to reachability copy', () => {
    expect(formatApiFailure({ problem: 'NETWORK_ERROR' }, 'fallback')).toBe(
      networkReachabilityMessage(),
    );
    expect(formatApiFailure({ problem: 'TIMEOUT_ERROR' }, 'fallback')).toBe(
      networkReachabilityMessage('TIMEOUT_ERROR'),
    );
  });

  test('treats 401 as session expiry, not HTML gateway noise', () => {
    expect(formatApiFailure({ status: 401, data: '<html><head></head></html>' }, 'fallback')).toBe(
      'Your session has expired. Please sign in again.',
    );
  });

  test('does not label HTML 502 as session expiry', () => {
    expect(
      formatApiFailure(
        { status: 502, data: '<!DOCTYPE html><html><head></head><body>Bad Gateway</body></html>' },
        'Unable to load shifts.',
      ),
    ).toBe('The server returned an unexpected response. Please try again.');
  });

  test('returns API JSON message when present', () => {
    expect(
      formatApiFailure({ status: 400, data: { detail: 'You must be at the facility.' } }, 'fallback'),
    ).toBe('You must be at the facility.');
  });
});

describe('networkReachabilityMessage', () => {
  test('avoids local-API wording', () => {
    expect(networkReachabilityMessage()).not.toMatch(/API is running/i);
    expect(networkReachabilityMessage()).not.toMatch(/localhost/i);
  });
});
