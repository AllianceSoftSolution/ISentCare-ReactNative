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

export async function getStorageItem(key: string): Promise<string | null> {
  if (await SecureStore.isAvailableAsync()) {
    return SecureStore.getItemAsync(key);
  }
  return null;
}

export async function setStorageItem(key: string, value: string): Promise<void> {
  if (await SecureStore.isAvailableAsync()) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  throw new Error('Secure session storage is unavailable on this platform.');
}

export async function deleteStorageItem(key: string): Promise<void> {
  if (await SecureStore.isAvailableAsync()) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(key);
  }
}
