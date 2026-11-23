import type { SessionStatus } from '@/store/authStore';

export type AuthRoute = '/(tabs)/home' | '/(auth)/get-started' | '/(auth)/onboarding';

/**
 * Shared splash / tabs / sign-in destination for a known session status.
 * Returns null for transient statuses (checking, unknown, error).
 */
export function routeForSessionStatus(status: SessionStatus): AuthRoute | null {
  if (status === 'verified') return '/(tabs)/home';
  if (status === 'signedOut') return '/(auth)/get-started';
  if (status === 'pending' || status === 'incomplete') return '/(auth)/onboarding';
  return null;
}
