import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Tabs, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { restoreSession } from '@/api/session';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';
import { Skeleton, SkeletonLines } from '@/components/ui/Skeleton';

export default function TabsLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    // Always revalidate against the server so revoked/unverified accounts are not
    // admitted from a stale in-memory "verified" status.
    void restoreSession(true)
      .then((status) => {
        if (!active) return;
        if (status === 'verified') {
          setReady(true);
        } else if (status === 'signedOut') {
          router.replace('/(auth)/get-started');
        } else {
          router.replace('/(auth)/onboarding');
        }
      })
      .catch((sessionError: unknown) => {
        if (!active) return;
        const message =
          sessionError instanceof Error ? sessionError.message : 'Unable to check your account.';
        // Never paint raw HTML into the guard UI, and do not treat it as sign-out.
        setError(
          /<\s*(!doctype|html|head|body)\b/i.test(message)
            ? 'Unable to reach IsentCare. Check your internet connection and try again.'
            : message,
        );
      });

    return () => {
      active = false;
    };
  }, [retry, router]);

  if (!ready) {
    return (
      <SafeAreaView style={styles.guard}>
        {error ? (
          <View style={styles.guardMessage}>
            <Text style={styles.guardTitle}>We couldn’t verify your session</Text>
            <Text style={styles.guardText}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setError(null);
                setRetry((value) => value + 1);
              }}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.guardSkeleton}>
            <Skeleton style={{ width: 56, height: 56, borderRadius: 28 }} />
            <Skeleton style={{ width: '62%', height: 20 }} />
            <SkeletonLines count={3} />
            <Skeleton style={{ width: '100%', height: 110, borderRadius: 14 }} />
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerRight: () => <NotificationBell />,
        tabBarActiveTintColor: '#1d66a5',
        tabBarInactiveTintColor: '#667085',
        tabBarStyle: {
          backgroundColor: '#e8eff6',
        },
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <MaterialIcons name="home" size={24} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="shifts"
        options={{
          title: 'Shifts',
          tabBarIcon: ({ color }) => <MaterialIcons name="show-chart" size={24} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="shift-details"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color }) => <MaterialIcons name="work" size={24} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color }) => <MaterialIcons name="calendar-today" size={24} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <MaterialIcons name="person" size={24} color={color as string} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  guard: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 },
  guardSkeleton: { width: '100%', maxWidth: 380, alignItems: 'center', gap: 18 },
  guardMessage: { alignItems: 'center', gap: 12 },
  guardTitle: { color: '#263341', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  guardText: { color: '#667085', fontSize: 14, textAlign: 'center' },
  retryText: { color: FORM_PRIMARY, fontSize: 15, fontWeight: '700', padding: 8 },
});
