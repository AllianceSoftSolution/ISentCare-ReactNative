import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  fetchLicenseExpiryNotifications,
  fetchServerNotifications,
  markAllNotificationsRead,
  type AppNotification,
} from '@/api/notifications';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';
import { ScreenHeader, ScreenHeaderRefresh } from '@/components/ui/ScreenHeader';
import { Skeleton, SkeletonLines } from '@/components/ui/Skeleton';
import {
  liveNotificationToAppItem,
  subscribeLiveNotifications,
} from '@/store/liveNotifications';
import useNotificationBadgeStore from '@/store/notificationBadgeStore';

function parseNotificationDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value: string) {
  const date = parseNotificationDate(value);
  if (!date) return 'unknown';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sectionLabel(key: string) {
  if (key === 'unknown') return 'Earlier';
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: today.getFullYear() === date.getFullYear() ? undefined : 'numeric',
  });
}

function timeLabel(value: string) {
  const date = parseNotificationDate(value);
  if (!date) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function sortNewestFirst(a: AppNotification, b: AppNotification) {
  const aTime = parseNotificationDate(a.createdAt)?.getTime() ?? 0;
  const bTime = parseNotificationDate(b.createdAt)?.getTime() ?? 0;
  if (bTime !== aTime) return bTime - aTime;
  return b.id.localeCompare(a.id);
}

type NotificationSection = {
  key: string;
  label: string;
  items: AppNotification[];
};

function groupByDate(items: AppNotification[]): NotificationSection[] {
  const sorted = [...items].sort(sortNewestFirst);
  const sections: NotificationSection[] = [];
  const indexByKey = new Map<string, number>();

  sorted.forEach((item) => {
    const key = dateKey(item.createdAt);
    const existing = indexByKey.get(key);
    if (existing === undefined) {
      indexByKey.set(key, sections.length);
      sections.push({ key, label: sectionLabel(key), items: [item] });
      return;
    }
    sections[existing].items.push(item);
  });

  return sections;
}

type NotificationVisual = {
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  wrapStyle?: object;
  tag?: string;
};

function notificationVisual(item: AppNotification): NotificationVisual {
  if (item.kind === 'license_expiry') {
    return { icon: 'event-busy', color: '#b54708', wrapStyle: styles.iconWarn, tag: 'License expiry' };
  }

  const message = item.message.toLowerCase();
  if (message.includes('approved')) {
    return { icon: 'check-circle', color: '#067647', wrapStyle: styles.iconApprove, tag: 'Approved' };
  }
  if (message.includes('rejected')) {
    return { icon: 'cancel', color: '#b42318', wrapStyle: styles.iconReject, tag: 'Rejected' };
  }
  if (message.includes('cancelled') || message.includes('canceled')) {
    return { icon: 'event-busy', color: '#b54708', wrapStyle: styles.iconWarn, tag: 'Cancelled' };
  }

  return { icon: 'notifications', color: FORM_PRIMARY };
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setBadgeCount = useNotificationBadgeStore((state) => state.setCount);
  const refreshBadge = useNotificationBadgeStore((state) => state.refresh);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const sections = useMemo(() => groupByDate(items), [items]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [expiry, server] = await Promise.all([
        fetchLicenseExpiryNotifications({ includeDismissed: true }),
        fetchServerNotifications(1).catch(() => ({ results: [] as AppNotification[], hasMore: false })),
      ]);
      const combined = [...expiry, ...server.results].sort(sortNewestFirst);
      setItems(combined);
      // Badge clears when the inbox is opened; rows stay visually unread until leave.
      setBadgeCount(0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load notifications.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [setBadgeCount]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const unsubscribe = subscribeLiveNotifications((notification) => {
        const next = liveNotificationToAppItem(notification);
        setItems((current) => {
          if (current.some((item) => item.id === next.id || (
            next.serverId != null && item.serverId === next.serverId
          ))) {
            return current;
          }
          return [next, ...current];
        });
        // Inbox is open — keep the badge cleared while still showing unread styling.
        setBadgeCount(0);
      });
      return () => {
        unsubscribe();
        const licenseIds = itemsRef.current
          .filter((item) => item.kind === 'license_expiry')
          .map((item) => item.id);
        void markAllNotificationsRead(licenseIds).then(() => {
          setBadgeCount(0);
          void refreshBadge();
        });
      };
    }, [load, refreshBadge, setBadgeCount]),
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <ScreenHeader
        title="Notifications"
        onBack={() => router.back()}
        right={<ScreenHeaderRefresh onPress={() => void load()} disabled={loading} />}
      />
      <ScrollView contentContainerStyle={styles.container}>
        {loading ? (
          <View style={styles.list}>
            <Text style={styles.sectionLabel}>Today</Text>
            <View style={styles.card}><Skeleton style={{ width: '78%', height: 16 }} /><SkeletonLines count={2} /></View>
            <View style={styles.card}><Skeleton style={{ width: '68%', height: 16 }} /><SkeletonLines count={2} /></View>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <MaterialIcons name="wifi-off" size={28} color="#b42318" />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void load()}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.stateCard}>
            <MaterialIcons name="notifications-none" size={34} color="#98a2b3" />
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.mutedText}>Shift updates and license expiry alerts will show up here.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {sections.map((section) => (
              <View key={section.key} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionRule} />
                  <Text style={styles.sectionLabel}>{section.label}</Text>
                  <View style={styles.sectionRule} />
                </View>
                {section.items.map((item) => {
                  const visual = notificationVisual(item);
                  return (
                    <View key={item.id} style={[styles.card, item.isRead && styles.cardRead]}>
                      <View style={[styles.iconWrap, visual.wrapStyle]}>
                        <MaterialIcons name={visual.icon} size={20} color={visual.color} />
                      </View>
                      <View style={styles.cardBody}>
                        <Text style={[styles.message, item.isRead && styles.messageRead]}>{item.message}</Text>
                        {visual.tag ? (
                          <Text style={[styles.tag, { color: visual.color }]}>{visual.tag}</Text>
                        ) : (
                          <Text style={styles.time}>{timeLabel(item.createdAt)}</Text>
                        )}
                        {visual.tag ? <Text style={styles.time}>{timeLabel(item.createdAt)}</Text> : null}
                      </View>
                      {!item.isRead ? <View style={styles.unreadDot} accessibilityLabel="Unread" /> : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f9fc' },
  container: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, gap: 12 },
  list: { gap: 14 },
  section: { gap: 10 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    marginTop: 2,
  },
  sectionRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#d0d5dd',
  },
  sectionLabel: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e7edf3',
    backgroundColor: '#fff',
  },
  cardRead: { backgroundColor: '#f8fafc' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eaf3fb',
  },
  iconWarn: { backgroundColor: '#fffaeb' },
  iconApprove: { backgroundColor: '#ecfdf3' },
  iconReject: { backgroundColor: '#fef3f2' },
  cardBody: { flex: 1, gap: 6 },
  message: { color: '#263341', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  messageRead: { fontWeight: '500', color: '#475467' },
  tag: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '700' },
  time: { color: '#667085', fontSize: 12 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: FORM_PRIMARY,
  },
  stateCard: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e7edf3',
    backgroundColor: '#fff',
  },
  emptyTitle: { color: '#344054', fontSize: 16, fontWeight: '700' },
  mutedText: { color: '#667085', fontSize: 14, textAlign: 'center' },
  errorText: { color: '#b42318', fontSize: 14, textAlign: 'center' },
  retryText: { color: FORM_PRIMARY, fontSize: 14, fontWeight: '700', padding: 8 },
});
