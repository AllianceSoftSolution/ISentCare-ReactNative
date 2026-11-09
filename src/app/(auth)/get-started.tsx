import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Spacing } from '@/constants/theme';

const PRIMARY = '#1d66a5';

export default function GetStartedScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Image
          accessibilityLabel="IsentCare Healthcare Staffing"
          source={require('@/assets/images/isent-care-logo-white.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            style={styles.signInButton}
            onPress={() => router.push('/(auth)/sign-in')}>
            <Text style={styles.signInText}>Sign In</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.signUpButton}
            onPress={() => router.push('/(auth)/register')}>
            <Text style={styles.signUpText}>Sign Up</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: PRIMARY },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: '22%',
    paddingBottom: Spacing.five,
  },
  logo: { width: 280, height: 280 },
  actions: { width: '100%', maxWidth: 480, gap: Spacing.three },
  signInButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fff',
  },
  signInText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  signUpButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  signUpText: { color: PRIMARY, fontSize: 16, fontWeight: '700' },
});
