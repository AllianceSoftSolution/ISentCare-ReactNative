import type { AppNotification } from '@/api/notifications';

export type LiveJobNotification = {
  id: string;
  serverId?: number;
  message: string;
  createdAt: string;
  isRead: boolean;
};

type Listener = (notification: LiveJobNotification) => void;

const listeners = new Set<Listener>();

export function subscribeLiveNotifications(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitLiveNotification(notification: LiveJobNotification) {
  listeners.forEach((listener) => {
    try {
      listener(notification);
    } catch {
      // Listener errors must not break the socket handler.
    }
  });
}

export function liveNotificationToAppItem(notification: LiveJobNotification): AppNotification {
  return {
    id: notification.id,
    serverId: notification.serverId,
    message: notification.message,
    createdAt: notification.createdAt,
    kind: 'server',
    isRead: notification.isRead,
  };
}
