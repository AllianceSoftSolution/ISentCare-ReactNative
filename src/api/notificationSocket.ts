import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import useAuthStore from '@/store/authStore';
import { emitLiveNotification } from '@/store/liveNotifications';
import useNotificationBadgeStore from '@/store/notificationBadgeStore';

const configuredBaseURL = (
  typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_API_BASE_URL : undefined
)
  ?.trim()
  .replace(/\/+$/, '');

function websocketUrl(accessToken: string) {
  if (!configuredBaseURL) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not set.');
  }
  const apiOrigin = configuredBaseURL.replace(/\/api$/, '');
  const wsOrigin = apiOrigin.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  return `${wsOrigin}/ws/chat/?token=${encodeURIComponent(accessToken)}`;
}

type SocketController = {
  stop: () => void;
};

let activeController: SocketController | null = null;

function parseJobNotification(raw: string) {
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type : '';
  const message = typeof record.message === 'string' ? record.message.trim() : '';
  if (!message) return null;
  if (type && type !== 'JobNotification') return null;

  const notificationId =
    typeof record.notification_id === 'number' && Number.isFinite(record.notification_id)
      ? record.notification_id
      : undefined;
  const createdAt =
    typeof record.created_at === 'string' && record.created_at.trim()
      ? record.created_at
      : new Date().toISOString();
  const isRead = Boolean(record.is_read);

  return {
    id: notificationId != null ? `server-${notificationId}` : `server-live-${Date.now()}`,
    serverId: notificationId,
    message,
    createdAt,
    isRead,
  };
}

/**
 * Keep a single authenticated WebSocket open for live JobNotification events.
 * Safe no-op when Redis/Channels is down — REST badge refresh remains the fallback.
 */
export function startNotificationSocket(): () => void {
  if (activeController) {
    return activeController.stop;
  }

  let socket: WebSocket | null = null;
  let disposed = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let appStateSub: NativeEventSubscription | null = null;
  let tokenUnsubscribe: (() => void) | null = null;

  const clearReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const closeSocket = () => {
    if (!socket) return;
    const current = socket;
    socket = null;
    try {
      current.onopen = null;
      current.onmessage = null;
      current.onerror = null;
      current.onclose = null;
      current.close();
    } catch {
      // ignore
    }
  };

  const scheduleReconnect = () => {
    if (disposed) return;
    const token = useAuthStore.getState().token;
    if (!token) return;
    clearReconnect();
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt, 5));
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (disposed) return;
    const token = useAuthStore.getState().token;
    if (!token) {
      closeSocket();
      return;
    }

    clearReconnect();
    closeSocket();

    let url: string;
    try {
      url = websocketUrl(token);
    } catch {
      return;
    }

    try {
      const next = new WebSocket(url);
      socket = next;

      next.onopen = () => {
        reconnectAttempt = 0;
      };

      next.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        const notification = parseJobNotification(event.data);
        if (!notification) return;
        // Bump first; an open inbox subscriber clears the badge afterward.
        if (!notification.isRead) {
          useNotificationBadgeStore.getState().increment(1);
        }
        emitLiveNotification(notification);
      };

      next.onerror = () => {
        // onclose handles reconnect
      };

      next.onclose = () => {
        if (socket === next) socket = null;
        if (!disposed && useAuthStore.getState().token) {
          scheduleReconnect();
        }
      };
    } catch {
      scheduleReconnect();
    }
  };

  const onAppState = (state: AppStateStatus) => {
    if (state !== 'active' || disposed) return;
    if (!useAuthStore.getState().token) return;
    if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
      reconnectAttempt = 0;
      connect();
      void useNotificationBadgeStore.getState().refresh();
    }
  };

  tokenUnsubscribe = useAuthStore.subscribe((state, previous) => {
    if (disposed) return;
    if (!state.token) {
      clearReconnect();
      closeSocket();
      return;
    }
    if (state.token !== previous.token) {
      reconnectAttempt = 0;
      connect();
    }
  });

  appStateSub = AppState.addEventListener('change', onAppState);
  connect();

  const stop = () => {
    if (disposed) return;
    disposed = true;
    clearReconnect();
    closeSocket();
    appStateSub?.remove();
    appStateSub = null;
    tokenUnsubscribe?.();
    tokenUnsubscribe = null;
    if (activeController?.stop === stop) {
      activeController = null;
    }
  };

  activeController = { stop };
  return stop;
}

export function stopNotificationSocket() {
  activeController?.stop();
  activeController = null;
}
