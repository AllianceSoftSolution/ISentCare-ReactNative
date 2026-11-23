import { routeForSessionStatus } from '@/utils/sessionRouting';

describe('routeForSessionStatus', () => {
  test('verified opens main app', () => {
    expect(routeForSessionStatus('verified')).toBe('/(tabs)/home');
  });

  test('signedOut opens Get Started (not Sign In)', () => {
    expect(routeForSessionStatus('signedOut')).toBe('/(auth)/get-started');
  });

  test('pending and incomplete stay in onboarding', () => {
    expect(routeForSessionStatus('pending')).toBe('/(auth)/onboarding');
    expect(routeForSessionStatus('incomplete')).toBe('/(auth)/onboarding');
  });

  test('transient statuses do not invent a route', () => {
    expect(routeForSessionStatus('checking')).toBeNull();
    expect(routeForSessionStatus('unknown')).toBeNull();
    expect(routeForSessionStatus('error')).toBeNull();
  });
});
