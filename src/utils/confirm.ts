import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirm. React Native Web's Alert.alert button callbacks
 * often do not run, so deletes appear broken in the browser.
 */
export function confirmAction(
  title: string,
  message: string,
  options?: {
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  },
): Promise<boolean> {
  const confirmLabel = options?.confirmLabel || 'Delete';
  const cancelLabel = options?.cancelLabel || 'Cancel';

  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(
      typeof globalThis.confirm === 'function' ? globalThis.confirm(text) : true,
    );
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      {
        text: cancelLabel,
        style: 'cancel',
        onPress: () => resolve(false),
      },
      {
        text: confirmLabel,
        style: options?.destructive === false ? 'default' : 'destructive',
        onPress: () => resolve(true),
      },
    ]);
  });
}
