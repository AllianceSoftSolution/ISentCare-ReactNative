import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { fetchLicenseExpiryNotifications } from '@/api/notifications';

export function NotificationBell({ color = '#344054' }: { color?: string }) {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void fetchLicenseExpiryNotifications()
        .then((items) => {
          if (active) setCount(items.length);
        })
        .catch(() => {
          if (active) setCount(0);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifications, ${count} alerts` : 'Notifications'}
      hitSlop={8}
      style={styles.button}
      onPress={() => router.push('/notifications' as Href)}>
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
