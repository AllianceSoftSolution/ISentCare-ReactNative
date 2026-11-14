import { useCallback, useEffect } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import useNotificationBadgeStore from '@/store/notificationBadgeStore';

export function NotificationBell({ color = '#344054' }: { color?: string }) {
  const router = useRouter();
  const count = useNotificationBadgeStore((state) => state.count);
  const refresh = useNotificationBadgeStore((state) => state.refresh);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return undefined;
    }, [refresh]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      hitSlop={8}
      style={styles.button}
      onPress={() => {
        // Keep the badge until the inbox loads; it clears there / on mark-read.
        router.push('/notifications' as Href);
      }}>
      <MaterialIcons name="notifications-none" size={26} color={color} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : String(count)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#b42318',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
