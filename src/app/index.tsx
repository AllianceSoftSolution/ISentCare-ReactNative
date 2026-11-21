import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { restoreSession } from '@/api/session';

export default function StartupScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      try {
        const status = await restoreSession(true);
        await minimumSplashTime;
        if (!active) return;
        if (status === 'verified') {
          router.replace('/(tabs)/home');
        } else if (status === 'signedOut') {
          router.replace('/(auth)/sign-in');
        } else {
          router.replace('/(auth)/onboarding');
        }
      } catch (initializationError) {
        if (!active) return;
        const message =
          initializationError instanceof Error
            ? initializationError.message
            : 'Unable to check your session. Please try again.';
        if (/<\s*(!doctype|html|head|body)\b/i.test(message)) {
          router.replace('/(auth)/sign-in');
          return;
        }
        setError(message);
      }
    };

    const minimumSplashTime = new Promise((resolve) => setTimeout(resolve, 450));
    void initialize();

    return () => {
      active = false;
    };
  }, [attempt, router]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Image
          accessibilityLabel="IsentCare Healthcare Staffing"
          source={require('@/assets/images/isent-care-logo-white.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        {error ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorTitle}>We couldn’t check your session</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setError(null);
                setAttempt((value) => value + 1);
              }}>
              <Text style={styles.retry}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <ActivityIndicator size="large" color="#1d66a5" />
            <Text style={styles.loadingText}>Loading your account…</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 24 },
  // Match Flutter splash: square bounds so the full S mark + wordmark fit via contain.
  logo: { width: 280, height: 280 },
  loadingText: { color: '#fff', fontSize: 14, fontFamily: 'Poppins' },
  errorPanel: { width: '100%', maxWidth: 400, alignItems: 'center', gap: 12 },
  errorTitle: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', fontFamily: 'Poppins' },
  errorText: { color: '#fff', fontSize: 14, textAlign: 'center', fontFamily: 'Poppins' },
  retry: { color: '#fff', fontSize: 15, fontWeight: '700', padding: 8, fontFamily: 'Poppins' },
});
