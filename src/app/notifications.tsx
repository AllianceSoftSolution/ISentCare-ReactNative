import { useCallback, useState } from 'react';
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
import useNotificationBadgeStore from '@/store/notificationBadgeStore';

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setBadgeCount = useNotificationBadgeStore((state) => state.setCount);
  const refreshBadge = useNotificationBadgeStore((state) => state.refresh);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [expiry, server] = await Promise.all([
        fetchLicenseExpiryNotifications({ includeDismissed: true }),
        fetchServerNotifications(1).catch(() => ({ results: [] as AppNotification[], hasMore: false })),
      ]);
      const combined = [...expiry, ...server.results];
      setItems(combined);

      // Always mark inbox as read when opened so the bell badge clears even if
      // client/server unread state was out of sync.
      await markAllNotificationsRead(expiry.map((item) => item.id));
      setItems((current) => current.map((item) => ({ ...item, isRead: true })));
      setBadgeCount(0);
      void refreshBadge();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load notifications.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [refreshBadge, setBadgeCount]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
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
            {items.map((item) => (
              <View key={item.id} style={[styles.card, item.isRead && styles.cardRead]}>
                <View style={[styles.iconWrap, item.kind === 'license_expiry' && styles.iconWarn]}>
                  <MaterialIcons
                    name={item.kind === 'license_expiry' ? 'event-busy' : 'notifications'}
                    size={20}
                    color={item.kind === 'license_expiry' ? '#b54708' : FORM_PRIMARY}
                  />
                </View>
                <View style={styles.cardBody}>
                  <Text style={[styles.message, item.isRead && styles.messageRead]}>{item.message}</Text>
                  {item.kind === 'license_expiry' ? (
                    <Text style={styles.tag}>License expiry</Text>
                  ) : (
                    <Text style={styles.time}>{timeLabel(item.createdAt)}</Text>
                  )}
                </View>
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
  list: { gap: 10 },
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
  cardBody: { flex: 1, gap: 6 },
  message: { color: '#263341', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  messageRead: { fontWeight: '500', color: '#475467' },
  tag: { alignSelf: 'flex-start', color: '#b54708', fontSize: 12, fontWeight: '700' },
  time: { color: '#667085', fontSize: 12 },
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
