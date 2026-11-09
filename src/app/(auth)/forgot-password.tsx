import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { confirmPasswordReset, requestPasswordReset } from '@/api/auth';
import { FORM_PRIMARY, IconTextInput } from '@/components/ui/RegistrationFields';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Spacing } from '@/constants/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'reset' | 'complete'>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendEmail = async (resend = false) => {
    if (loading) return;
    if (!email.trim()) {
      setError('Enter the email address associated with your account.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await requestPasswordReset(email);
      setStep('reset');
      setToken('');
      setPassword('');
      setConfirmPassword('');
      setMessage(
        resend
          ? 'A new password reset code has been sent. Use the latest code within 5 minutes.'
          : 'A password reset code has been sent to your email. Enter it below within 5 minutes.',
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not send the password reset email.');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (loading) return;
    if (!/^\d{5}$/.test(token.trim())) {
      setError('Enter the 5-digit password reset code from your email.');
      return;
    }
    if (!password || !confirmPassword) {
      setError('Enter and confirm your new password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await confirmPasswordReset(token, password, confirmPassword);
      setStep('complete');
      setMessage('Your password has been changed. You can now sign in with your new password.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Could not reset your password.');
    } finally {
      setLoading(false);
    }
  };

  const changeEmail = () => {
    setStep('email');
    setToken('');
    setPassword('');
    setConfirmPassword('');
    setMessage(null);
    setError(null);
  };

  const headerTitle =
    step === 'complete' ? 'Password updated' : step === 'reset' ? 'Reset password' : 'Forgot password';

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <ScreenHeader title={headerTitle} onBack={() => router.back()} backLabel="Back to sign in" />
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
        <View style={styles.iconWrap}>
          <MaterialIcons name="lock-reset" size={30} color={FORM_PRIMARY} />
        </View>
        <Text style={styles.title}>
          {step === 'complete' ? 'Password updated' : step === 'reset' ? 'Reset your password' : 'Forgot password?'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 'email'
            ? 'Enter your email and we’ll send you a reset code.'
            : step === 'reset'
              ? `Enter the code sent to ${email.trim()} and choose a new password.`
              : 'Your password reset was successful.'}
        </Text>
        {step === 'email' ? (
          <IconTextInput
            backgroundColor="#fff"
            textColor="#232323"
            icon="email"
            placeholder="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!loading}
          />
        ) : null}
        {step === 'reset' ? (
          <>
            <IconTextInput
              backgroundColor="#fff"
              textColor="#232323"
              icon="vpn-key"
              placeholder="5-digit reset code"
              value={token}
              onChangeText={(value) => setToken(value.replace(/\D/g, '').slice(0, 5))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={5}
              editable={!loading}
            />
            <IconTextInput
              backgroundColor="#fff"
              textColor="#232323"
              icon="lock"
              placeholder="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              autoCapitalize="none"
              editable={!loading}
            />
            <IconTextInput
              backgroundColor="#fff"
              textColor="#232323"
              icon="lock-outline"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
              autoCapitalize="none"
              editable={!loading}
            />
          </>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
        {step === 'email' ? (
          <Pressable
            accessibilityRole="button"
            style={[styles.button, loading && styles.disabled]}
            onPress={() => void sendEmail()}
            disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send Email</Text>}
          </Pressable>
        ) : null}
        {step === 'reset' ? (
          <>
            <Pressable
              accessibilityRole="button"
              style={[styles.button, loading && styles.disabled]}
              onPress={() => void resetPassword()}
              disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Reset Password</Text>}
            </Pressable>
            <View style={styles.signInRow}>
              <Pressable onPress={() => void sendEmail(true)} disabled={loading} hitSlop={6}>
                <Text style={styles.link}>Resend code</Text>
              </Pressable>
              <Text style={styles.bodyText}>·</Text>
              <Pressable onPress={changeEmail} disabled={loading} hitSlop={6}>
                <Text style={styles.link}>Change email</Text>
              </Pressable>
            </View>
          </>
        ) : null}
        {step === 'complete' ? (
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={styles.buttonText}>Back to Sign In</Text>
          </Pressable>
        ) : null}
        {step !== 'complete' ? (
          <View style={styles.signInRow}>
            <Text style={styles.bodyText}>Remembered your password?</Text>
            <Pressable onPress={() => router.back()} hitSlop={6}>
              <Text style={styles.link}>Sign In</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  keyboardAvoiding: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    padding: 24,
    gap: Spacing.three,
  },
  iconWrap: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    borderRadius: 30,
    backgroundColor: '#e5f1ff',
  },
  title: { color: FORM_PRIMARY, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#667085', fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: Spacing.two },
  bodyText: { color: '#344054', fontSize: 14 },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
    borderRadius: 10,
    backgroundColor: FORM_PRIMARY,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  error: { color: '#b42318', backgroundColor: '#fef3f2', padding: 12, borderRadius: 8, fontSize: 13 },
  message: { color: '#175cd3', backgroundColor: '#eff8ff', padding: 12, borderRadius: 8, fontSize: 13 },
  signInRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.one, marginTop: Spacing.two },
  link: { color: FORM_PRIMARY, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
