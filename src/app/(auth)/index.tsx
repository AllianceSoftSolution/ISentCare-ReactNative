import { useRouter } from 'expo-router';
import { getStorageItem, setStorageItem } from '@/utils/storage';
import { login } from '@/api/auth';
import useAuthStore from '@/store/authStore';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing } from '@/constants/theme';

const PRIMARY = '#1d66a5';

export default function LoginScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getStorageItem('access_token');
        if (token) {
          router.replace('/(tabs)/home');
        }
      } finally {
        setChecking(false);
        
      }
    })();
  }, [router]);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Enter Email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await login(email, password);
      if (data?.access) {
        await setStorageItem('access_token', String(data.access));
        useAuthStore.getState().setToken(String(data.access));
      }
      if (data?.refresh) {
        await setStorageItem('refresh_token', String(data.refresh));
      }
      router.replace('/(tabs)/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        <Image
          source={require('@/assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>Sign In</Text>

        <View style={[styles.inputWrapper, { backgroundColor: colors.backgroundElement }]}>
          <MaterialIcons name="email" size={20} color="rgba(0,0,0,0.5)" />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="Email"
            placeholderTextColor="rgba(0,0,0,0.5)"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
          />
        </View>

        <View style={[styles.inputWrapper, { backgroundColor: colors.backgroundElement }]}>
          <MaterialIcons name="lock" size={20} color="rgba(0,0,0,0.5)" />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="Password"
            placeholderTextColor="rgba(0,0,0,0.5)"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />
          <Pressable onPress={() => setShowPassword((v) => !v)}>
            <MaterialIcons
              name={showPassword ? 'visibility' : 'visibility-off'}
              size={20}
              color="rgba(0,0,0,0.5)"
            />
          </Pressable>
        </View>

        <Pressable style={styles.forgot} onPress={() => {}}>
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, loading && styles.disabled]}
          onPress={onSubmit}
          disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
        </Pressable>

        <View style={styles.registerRow}>
          <Text style={{ color: colors.text }}>Don&apos;t have an account? </Text>
          <Pressable onPress={() => {}}>
            <Text style={styles.registerText}>Register</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: Spacing.two,
  },
  logo: {
    width: 250,
    height: 120,
    alignSelf: 'center',
    marginBottom: Spacing.four,
  },
  title: {
    fontSize: 20,
    color: PRIMARY,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.one,
  },
  forgot: {
    alignSelf: 'flex-end',
  },
  forgotText: {
    color: '#232323',
    fontSize: 14,
    fontWeight: '500',
  },
  button: {
    backgroundColor: PRIMARY,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: Spacing.four,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#EF2F2F',
    fontSize: 13,
    textAlign: 'center',
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  registerText: {
    color: PRIMARY,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
});
