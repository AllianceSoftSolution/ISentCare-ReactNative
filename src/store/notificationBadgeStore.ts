import { create } from 'zustand';
import { fetchUnreadNotificationCount } from '@/api/notifications';

type NotificationBadgeState = {
  count: number;
  refreshing: boolean;
  setCount: (count: number) => void;
  refresh: () => Promise<number>;
};

let refreshSeq = 0;

const useNotificationBadgeStore = create<NotificationBadgeState>((set, get) => ({
  count: 0,
  refreshing: false,
  setCount: (count) => set({ count: Math.max(0, count) }),
  refresh: async () => {
    const seq = ++refreshSeq;
    set({ refreshing: true });
    try {
      const count = await fetchUnreadNotificationCount();
      if (seq === refreshSeq) {
        set({ count: Math.max(0, count), refreshing: false });
      }
      return count;
    } catch {
      if (seq === refreshSeq) {
        set({ refreshing: false });
      }
      return get().count;
    }
  },
}));

export default useNotificationBadgeStore;
