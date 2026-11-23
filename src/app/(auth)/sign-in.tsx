import { useRouter } from 'expo-router';
import { LoginError, login } from '@/api/auth';
import { clearSession, restoreSession, saveSessionTokens } from '@/api/session';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Spacing } from '@/constants/theme';

const PRIMARY = '#1d66a5';
const LOGO_ASPECT_RATIO = 1280 / 313;
const LOGO_MAX_WIDTH = 280;
const LOGO_MIN_WIDTH = 160;
const LOGO_HORIZONTAL_INSET = 64;

export default function LoginScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const logoWidth = Math.max(
    LOGO_MIN_WIDTH,
    Math.min(LOGO_MAX_WIDTH, windowWidth - LOGO_HORIZONTAL_INSET),
  );
  const logoHeight = logoWidth / LOGO_ASPECT_RATIO;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (loading) return;
    if (!email.trim() || !password.trim()) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await login(email, password);
      await saveSessionTokens(data);
      const session = await restoreSession(true);
      if (session === 'verified') {
        router.replace('/(tabs)/home');
      } else if (session === 'incomplete') {
        // Email verified but onboarding not finished yet.
        router.replace('/(auth)/onboarding');
      } else if (session === 'pending') {
        // Authenticated but awaiting admin verification — same gate as splash.
        router.replace('/(auth)/onboarding');
      } else {
        await clearSession();
        throw new Error('Your session could not be verified. Please sign in again.');
      }
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : 'Sign in failed.';
      const lowerMessage = message.toLowerCase();
      if (loginError instanceof LoginError && loginError.blocked) {
        setError(message);
      } else if (
        lowerMessage.includes('verification and approval')
        || lowerMessage.includes('not verified')
        || lowerMessage.includes('administrator approval')
        || lowerMessage.includes('administrator verification')
      ) {
        setError('Your account is awaiting administrator approval. You can sign in after an administrator verifies your account.');
      } else if (lowerMessage.includes('no user matching') || lowerMessage.includes('invalid password')) {
        setError('Email or password is incorrect. Check your details and try again.');
      } else if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
        setError('Unable to connect. Check your internet connection and try again.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <ScreenHeader title="Sign In" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
        <Image
          accessibilityLabel="IsentCare Healthcare Staffing"
          source={require('@/assets/images/logo.png')}
          style={[styles.logo, { width: logoWidth, height: logoHeight }]}
          resizeMode="contain"
        />

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue to IsentCare.</Text>

        <View style={styles.inputWrapper}>
          <MaterialIcons name="email" size={20} color="#667085" />
          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor="#7b8490"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
            accessibilityLabel="Email address"
          />
        </View>

        <View style={styles.inputWrapper}>
          <MaterialIcons name="lock" size={20} color="#667085" />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#7b8490"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            editable={!loading}
            autoCapitalize="none"
            accessibilityLabel="Password"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            onPress={() => setShowPassword((value) => !value)}
            hitSlop={8}>
            <MaterialIcons
              name={showPassword ? 'visibility' : 'visibility-off'}
              size={20}
              color="#667085"
            />
          </Pressable>
        </View>

        <Pressable style={styles.forgot} onPress={() => router.push('/(auth)/forgot-password')}>
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </Pressable>

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, loading && styles.disabled]}
          onPress={onSubmit}
          disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
        </Pressable>

        <View style={styles.registerRow}>
          <Text style={styles.bodyText}>Don&apos;t have an account?</Text>
          <Pressable onPress={() => router.push('/(auth)/register')} hitSlop={6}>
            <Text style={styles.registerText}>Register</Text>
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  keyboardAvoiding: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  logo: {
    alignSelf: 'center',
    maxWidth: '100%',
    marginBottom: Spacing.one,
  },
  title: {
    fontSize: 24,
    color: PRIMARY,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: { color: '#667085', fontSize: 14, textAlign: 'center', marginBottom: Spacing.two },
  bodyText: { color: '#344054', fontSize: 14 },
  inputWrapper: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d9d9df',
    backgroundColor: '#fff',
  },
  input: { flex: 1, minWidth: 0, color: '#232323', fontSize: 15, paddingVertical: Spacing.three },
  forgot: { alignSelf: 'flex-end', paddingVertical: Spacing.one },
  forgotText: { color: PRIMARY, fontSize: 14, fontWeight: '500' },
  button: {
    backgroundColor: PRIMARY,
    minHeight: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: Spacing.two,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  error: {
    color: '#b42318',
    fontSize: 13,
    textAlign: 'center',
    backgroundColor: '#fef3f2',
    padding: 12,
    borderRadius: 8,
  },
  registerRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.one, marginTop: Spacing.two },
  registerText: { color: PRIMARY, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
