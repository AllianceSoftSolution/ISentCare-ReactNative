import { useEffect } from 'react';
import { startNotificationSocket } from '@/api/notificationSocket';

/** Keep the live notification socket open while the authenticated shell is mounted. */
export function useNotificationSocket(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return undefined;
    return startNotificationSocket();
  }, [enabled]);
}
