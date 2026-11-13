import type { AccountProfile, NotificationPreferences } from '@/api/settings';

export const ACCOUNT_SETTINGS_TTL_MS = 60_000;

export type AccountSettingsStateOption = { id: number; name: string };

type AccountSettingsCache = {
  profile: AccountProfile;
  prefs: NotificationPreferences;
  states: AccountSettingsStateOption[];
  updatedAt: number;
};

let cache: AccountSettingsCache | null = null;

export function getAccountSettingsCache() {
  return cache;
}

export function setAccountSettingsCache(payload: Omit<AccountSettingsCache, 'updatedAt'>) {
  cache = { ...payload, updatedAt: Date.now() };
}

export function isAccountSettingsCacheFresh(updatedAt: number, ttlMs = ACCOUNT_SETTINGS_TTL_MS) {
  return Date.now() - updatedAt < ttlMs;
}

export function invalidateAccountSettingsCache() {
  cache = null;
}
