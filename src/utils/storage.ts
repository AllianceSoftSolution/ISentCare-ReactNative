import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getLocalStorageItem(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function setLocalStorageItem(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function deleteLocalStorageItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

/**
 * Prefer SecureStore on native. Fall back to AsyncStorage on web / Expo Go
 * environments where SecureStore is unavailable so auth still works in browser.
 */
async function canUseSecureStore() {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getStorageItem(key: string): Promise<string | null> {
  if (await canUseSecureStore()) {
    return SecureStore.getItemAsync(key);
  }
  return AsyncStorage.getItem(key);
}

export async function setStorageItem(key: string, value: string): Promise<void> {
  if (await canUseSecureStore()) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

export async function deleteStorageItem(key: string): Promise<void> {
  if (await canUseSecureStore()) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await AsyncStorage.removeItem(key);
}
