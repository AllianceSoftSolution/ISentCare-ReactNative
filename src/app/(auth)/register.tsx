import { useRouter } from 'expo-router';
import { register, requestSignupOtp, verifySignupOtp } from '@/api/auth';
import { saveSessionTokens } from '@/api/session';
import apiClient from '@/api/apiClient';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/constants/theme';
import {
  FORM_PRIMARY,
  IconDateField,
  IconTextInput,
  normalizeApiDate,
  RegistrationStepper,
} from '@/components/ui/RegistrationFields';
import type { SelectedUpload } from '@/utils/upload';
import { MaterialIcons } from '@expo/vector-icons';

type StateOption = { id: number; name: string };
type AddressSuggestion = { id: string; label: string };
const SIGNUP_OTP_TTL_SECONDS = 5 * 60;

export default function RegisterScreen() {
  const router = useRouter();
  const colors = Colors.light;

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [perDiem, setPerDiem] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [ssn, setSsn] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [emailVerificationToken, setEmailVerificationToken] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [otpRemainingSeconds, setOtpRemainingSeconds] = useState(0);
  const [address, setAddress] = useState('');
  const [addressSelected, setAddressSelected] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);
  const [addressSearchError, setAddressSearchError] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [idImage, setIdImage] = useState<SelectedUpload | null>(null);
  const [states, setStates] = useState<StateOption[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [statesError, setStatesError] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<StateOption | null>(null);
  const [stateModalVisible, setStateModalVisible] = useState(false);

  useEffect(() => {
    if (!otpSent || otpExpiresAt === null) return;

    const updateRemainingTime = () => {
      const remaining = Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000));
      setOtpRemainingSeconds(remaining);
      if (remaining === 0) clearInterval(timer);
    };
    const timer = setInterval(updateRemainingTime, 1000);
    updateRemainingTime();
    return () => clearInterval(timer);
  }, [otpExpiresAt, otpSent]);

  useEffect(() => {
    let active = true;
    const query = address.trim();
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY?.trim();

    if (otpSent || addressSelected || query.length < 3) {
      return;
    }

    if (!apiKey) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAddressSearchLoading(true);
      setAddressSearchError(null);
      try {
        const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text',
          },
          body: JSON.stringify({ input: query }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Address lookup failed (HTTP ${response.status}).`);
        }
        const result = (await response.json()) as {
          suggestions?: {
            placePrediction?: {
              placeId?: string;
              text?: { text?: string };
            };
          }[];
        };
        if (!active) return;
        const suggestions = (result.suggestions ?? []).flatMap((item) => {
          const prediction = item.placePrediction;
          const label = prediction?.text?.text;
          const id = prediction?.placeId;
          return label && id ? [{ id, label }] : [];
        });
        setAddressSuggestions(suggestions);
      } catch (searchError) {
        if (!active || (searchError instanceof Error && searchError.name === 'AbortError')) return;
        setAddressSuggestions([]);
        setAddressSearchError(
          searchError instanceof Error
            ? `${searchError.message} You can still enter your address manually.`
            : 'Address lookup failed. You can still enter your address manually.',
        );
      } finally {
        if (active) setAddressSearchLoading(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [address, addressSelected, otpSent]);

  const startOtpCountdown = () => {
    setAddressSearchLoading(false);
    setOtpExpiresAt(Date.now() + SIGNUP_OTP_TTL_SECONDS * 1000);
    setOtpRemainingSeconds(SIGNUP_OTP_TTL_SECONDS);
    setOtpSent(true);
  };

  const loadStates = useCallback(async () => {
    setStatesLoading(true);
    setStatesError(null);
    try {
      const response = await apiClient.get<
        StateOption[] | { results?: StateOption[] }
      >('/states/?page=1&page_size=500');
      if (!response.ok) {
        throw new Error(
          response.problem === 'NETWORK_ERROR' || response.problem === 'TIMEOUT_ERROR' || response.problem === 'CONNECTION_ERROR'
            ? 'No internet connection. Check your connection and try again.'
            : 'Unable to load states. Please try again.',
        );
      }
      const data = response.data;
      const list = Array.isArray(data) ? data : data?.results;
      if (!list) {
        throw new Error('The server returned an invalid state list.');
      }
      setStates(list);
    } catch (loadError) {
      setStatesError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load states. Please try again.',
      );
    } finally {
      setStatesLoading(false);
    }
  }, []);

  const pickIdImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      setIdImage({
        uri: asset.uri,
        name: asset.fileName || 'identity-image.jpg',
        mimeType: asset.mimeType,
        file: asset.file,
      });
    }
  };

  const onNextFromJobType = async () => {
    if (loading) return;
    if (!title.trim()) {
      setError('License or certification is required.');
      return;
    }
    if (!perDiem) {
      setError('Please select at least one interest.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (!(await Location.hasServicesEnabledAsync())) {
        throw new Error('Turn on location services in your device settings, then try again.');
      }
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error(
          permission.canAskAgain
            ? 'Location access is needed to continue registration. Allow access and try again.'
            : 'Location access is needed to continue registration. Enable it for IsentCare in your device settings.',
        );
      }
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
      });
      if (
        !Number.isFinite(location.coords.latitude) ||
        !Number.isFinite(location.coords.longitude) ||
        location.coords.latitude < -90 ||
        location.coords.latitude > 90 ||
        location.coords.longitude < -180 ||
        location.coords.longitude > 180
      ) {
        throw new Error('Your current location could not be determined. Please try again.');
      }
      setCoordinates({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      setStep(1);
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : 'Unable to get your location. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const onOpenStatePicker = () => {
    setStateModalVisible(true);
    void loadStates();
  };

  const onEmailChange = (value: string) => {
    setEmail(value);
    if (verificationEmail && value.trim().toLowerCase() !== verificationEmail.toLowerCase()) {
      setVerificationEmail('');
      setEmailVerificationToken(null);
      setVerificationCode('');
      setOtpSent(false);
      setOtpExpiresAt(null);
      setOtpRemainingSeconds(0);
    }
  };

  const onResendSignupOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      await requestSignupOtp(email);
      setVerificationEmail(email.trim());
      setEmailVerificationToken(null);
      setVerificationCode('');
      startOtpCountdown();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not resend the verification code.');
    } finally {
      setLoading(false);
    }
  };

  const createAccount = async (formattedDob: string, verificationToken: string, stateId: number) => {
    if (!coordinates) {
      throw new Error('Location is required to complete registration. Go back to Job Type and try again.');
    }
    const data = await register(
      {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        dob: formattedDob,
        ssn: ssn.replace(/\D/g, ''),
        address: address.trim(),
        city: city.trim(),
        state: stateId,
        zip_code: zipCode.trim(),
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        type: 'P',
        title: title.trim(),
        per_diem: perDiem,
        email_verification_token: verificationToken,
      },
      idImage,
    );
    await saveSessionTokens(data);
    Alert.alert('Account created', 'Your account was created successfully.', [
      { text: 'Continue', onPress: () => router.replace('/') },
    ]);
  };

  const onSubmit = async () => {
    const formattedDob = normalizeApiDate(dob);
    if (!formattedDob) {
      setError('Select a valid date of birth.');
      return;
    }
    const birthDate = new Date(`${formattedDob}T00:00:00`);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    if (
      today.getMonth() < birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())
    ) {
      age -= 1;
    }
    if (age < 18) {
      setError('You must be at least 18 years old to create an account.');
      return;
    }
    if (!coordinates) {
      setError('Location is required to complete registration. Go back to Job Type and allow location access.');
      return;
    }
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim() ||
      !phone.trim() ||
      !password ||
      !ssn.trim() ||
      !address.trim() ||
      !city.trim() ||
      !zipCode.trim() ||
      !selectedState
    ) {
      setError('Please complete all required personal information fields.');
      return;
    }
    if (!/^\d+$/.test(phone)) {
      setError('Phone number must contain digits only.');
      return;
    }
    if (!/^\d{5}$/.test(zipCode)) {
      setError('ZIP code must contain exactly 5 digits.');
      return;
    }
    if (!/^\d{9}$/.test(ssn.replace(/\D/g, ''))) {
      setError('SSN must contain 9 digits.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (otpSent && !emailVerificationToken && otpRemainingSeconds === 0) {
      setError('Your verification code has expired. Request a new code to continue.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (!emailVerificationToken) {
        if (!otpSent || verificationEmail.toLowerCase() !== email.trim().toLowerCase()) {
          await requestSignupOtp(email);
          setVerificationEmail(email.trim());
          setVerificationCode('');
          startOtpCountdown();
          return;
        }
        if (!/^\d{5}$/.test(verificationCode.trim())) {
          setError('Enter the 5-digit verification code sent to your email.');
          return;
        }
        const token = await verifySignupOtp(email, verificationCode);
        setEmailVerificationToken(token);
        await createAccount(formattedDob, token, selectedState.id);
        return;
      }

      await createAccount(formattedDob, emailVerificationToken, selectedState.id);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Registration failed.';
      if (message.toLowerCase().includes('verify your email')) {
        setEmailVerificationToken(null);
        setOtpSent(false);
        setVerificationCode('');
        setOtpExpiresAt(null);
        setOtpRemainingSeconds(0);
      } else if (message.toLowerCase().includes('expired')) {
        setOtpExpiresAt(Date.now());
        setOtpRemainingSeconds(0);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const fieldColors = {
    backgroundColor: colors.backgroundElement,
    textColor: colors.text,
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
        <Text style={styles.title}>{step === 0 ? 'Job Type' : 'Personal Information'}</Text>
        <RegistrationStepper activeStep={step === 0 ? 1 : 2} />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {step === 0 ? (
          <View style={styles.form}>
            <IconTextInput
              {...fieldColors}
              icon="badge"
              placeholder="Type of License or Certification *"
              value={title}
              onChangeText={setTitle}
              autoCapitalize="words"
            />
            <Text style={styles.sectionTitle}>Interested in: *</Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: perDiem }}
              style={[styles.interest, perDiem && styles.interestSelected]}
              onPress={() => setPerDiem((current) => !current)}>
              <MaterialIcons name="schedule" size={20} color={FORM_PRIMARY} />
              <Text style={styles.interestText}>Flexible on demand / Per Diem</Text>
              <MaterialIcons
                name={perDiem ? 'check-box' : 'check-box-outline-blank'}
                size={22}
                color={FORM_PRIMARY}
              />
            </Pressable>
            <Pressable style={[styles.button, loading && styles.disabled]} onPress={() => void onNextFromJobType()} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Next</Text>}
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <Pressable style={styles.imageUpload} onPress={() => void pickIdImage()} disabled={otpSent}>
              {idImage ? (
                <Image source={{ uri: idImage.uri }} style={styles.idImage} />
              ) : (
                <>
                  <MaterialIcons name="file-upload" size={28} color={FORM_PRIMARY} />
                  <Text style={styles.imageUploadText}>Upload ID Image</Text>
                </>
              )}
            </Pressable>
            {idImage ? (
              <Pressable onPress={() => setIdImage(null)} style={styles.removeImage} disabled={otpSent}>
                <MaterialIcons name="close" size={16} color="#b42318" />
                <Text style={styles.removeImageText}>Remove image</Text>
              </Pressable>
            ) : null}
            <IconTextInput {...fieldColors} icon="person" placeholder="First Name *" value={firstName} onChangeText={setFirstName} autoCapitalize="words" editable={!otpSent} />
            <IconTextInput {...fieldColors} icon="person-outline" placeholder="Last Name *" value={lastName} onChangeText={setLastName} autoCapitalize="words" editable={!otpSent} />
            <IconDateField {...fieldColors} placeholder="Date of Birth *" value={dob} onChange={setDob} editable={!otpSent} maximumDate={new Date()} />
            <IconTextInput {...fieldColors} icon="fingerprint" placeholder="SSN *" value={ssn} onChangeText={(value) => setSsn(value.replace(/\D/g, '').slice(0, 9))} keyboardType="number-pad" maxLength={9} editable={!otpSent} />
            <IconTextInput {...fieldColors} icon="email" placeholder="Email *" value={email} onChangeText={onEmailChange} keyboardType="email-address" autoCapitalize="none" autoComplete="email" editable={!otpSent} />
            <IconTextInput {...fieldColors} icon="phone" placeholder="Phone Number *" value={phone} onChangeText={(value) => setPhone(value.replace(/\D/g, ''))} keyboardType="phone-pad" autoComplete="tel" editable={!otpSent} />
            <IconTextInput {...fieldColors} icon="lock" placeholder="Password *" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" editable={!otpSent} />
            <IconTextInput {...fieldColors} icon="lock-outline" placeholder="Confirm Password *" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" editable={!otpSent} />
            <IconTextInput
              {...fieldColors}
              icon="home"
              placeholder="Address *"
              value={address}
              onChangeText={(value) => {
                setAddress(value);
                setAddressSelected(false);
                setAddressSuggestions([]);
                setAddressSearchLoading(false);
                setAddressSearchError(
                  value.trim().length >= 3 && !process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY?.trim()
                    ? 'Address suggestions are unavailable. Enter your full address manually.'
                    : null,
                );
              }}
              autoCapitalize="words"
              editable={!otpSent}
            />
            {addressSearchLoading ? (
              <View style={styles.addressSearchStatus}>
                <ActivityIndicator size="small" color={FORM_PRIMARY} />
                <Text style={styles.addressSearchText}>Finding addresses…</Text>
              </View>
            ) : null}
            {addressSuggestions.length ? (
              <View style={styles.suggestionList}>
                {addressSuggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion.id}
                    accessibilityRole="button"
                    style={styles.suggestion}
                    onPress={() => {
                      setAddress(suggestion.label);
                      setAddressSelected(true);
                      setAddressSuggestions([]);
                      setAddressSearchLoading(false);
                      setAddressSearchError(null);
                      Keyboard.dismiss();
                    }}>
                    <MaterialIcons name="place" size={19} color={FORM_PRIMARY} />
                    <Text style={styles.suggestionText}>{suggestion.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {addressSearchError ? <Text style={styles.addressSearchError}>{addressSearchError}</Text> : null}
            <IconTextInput {...fieldColors} icon="location-city" placeholder="City *" value={city} onChangeText={setCity} autoCapitalize="words" editable={!otpSent} />
            <Pressable style={[styles.selectField, { backgroundColor: colors.backgroundElement }]} onPress={onOpenStatePicker} disabled={otpSent}>
              <MaterialIcons name="map" size={20} color="#6b7280" />
              <Text style={[styles.selectText, { color: selectedState ? colors.text : '#7b8490' }]}>
                {selectedState?.name || 'Select State *'}
              </Text>
              <MaterialIcons name="arrow-drop-down" size={22} color="#6b7280" />
            </Pressable>
            <IconTextInput {...fieldColors} icon="markunread-mailbox" placeholder="Zip / Postal Code *" value={zipCode} onChangeText={(value) => setZipCode(value.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" maxLength={5} editable={!otpSent} />
            {otpSent ? (
              <View style={styles.verificationPanel}>
                <Text style={styles.verificationTitle}>Verify your email</Text>
                <Text style={styles.verificationMessage}>
                  Enter the 5-digit code sent to {verificationEmail}.
                </Text>
                <Text style={styles.verificationMessage}>
                  {otpRemainingSeconds > 0
                    ? `Code expires in ${String(Math.floor(otpRemainingSeconds / 60)).padStart(2, '0')}:${String(otpRemainingSeconds % 60).padStart(2, '0')}.`
                    : 'This code has expired. Request a new code to continue.'}
                </Text>
                <IconTextInput
                  {...fieldColors}
                  icon="mark-email-read"
                  placeholder="Email verification code"
                  value={verificationCode}
                  onChangeText={(value) => setVerificationCode(value.replace(/\D/g, '').slice(0, 5))}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={5}
                  editable={!loading && otpRemainingSeconds > 0}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void onResendSignupOtp()}
                  disabled={loading}>
                  <Text style={styles.resendText}>Resend verification code</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.row}>
              <Pressable style={[styles.button, styles.halfButton, styles.backButton, otpSent && styles.disabled]} onPress={() => { setError(null); setStep(0); }} disabled={otpSent || loading}>
                <Text style={styles.backButtonText}>Previous</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.halfButton, loading && styles.disabled]} onPress={() => void onSubmit()} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    {emailVerificationToken ? 'Next' : otpSent ? 'Verify & Continue' : 'Continue'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        <Modal visible={stateModalVisible} animationType="slide" transparent onRequestClose={() => setStateModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select State</Text>
              <ScrollView style={styles.stateList}>
                {statesLoading ? (
                  <ActivityIndicator color={FORM_PRIMARY} />
                ) : statesError ? (
                  <View>
                    <Text>{statesError}</Text>
                    <Pressable onPress={() => void loadStates()}>
                      <Text style={styles.retryText}>Try again</Text>
                    </Pressable>
                  </View>
                ) : states.length === 0 ? (
                  <Text>No states are available.</Text>
                ) : (
                  states.map((state) => (
                    <Pressable key={state.id} style={styles.stateItem} onPress={() => { setSelectedState(state); setStateModalVisible(false); }}>
                      <Text style={styles.stateName}>{state.name}</Text>
                      {selectedState?.id === state.id ? <MaterialIcons name="check" size={20} color={FORM_PRIMARY} /> : null}
                    </Pressable>
                  ))
                )}
              </ScrollView>
              <Pressable style={styles.button} onPress={() => setStateModalVisible(false)}>
                <Text style={styles.buttonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboardAvoiding: { flex: 1 },
  container: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, gap: Spacing.two },
  title: { fontSize: 24, color: FORM_PRIMARY, fontWeight: '700', textAlign: 'center' },
  form: { gap: Spacing.two },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#344054', marginTop: Spacing.two },
  interest: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: '#d8e0e8', borderRadius: 10 },
  interestSelected: { borderColor: FORM_PRIMARY, backgroundColor: '#eff7ff' },
  interestText: { flex: 1, color: '#344054', fontSize: 14 },
  imageUpload: { minHeight: 118, borderWidth: 1, borderStyle: 'dashed', borderColor: FORM_PRIMARY, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#f5faff' },
  imageUploadText: { color: FORM_PRIMARY, fontWeight: '600' },
  idImage: { width: '100%', height: 150, resizeMode: 'contain' },
  removeImage: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4 },
  removeImageText: { color: '#b42318', fontSize: 13 },
  selectField: { minHeight: 50, borderWidth: 1, borderColor: '#d8e0e8', borderRadius: Spacing.two, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three },
  selectText: { flex: 1, fontSize: 15 },
  addressSearchStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  addressSearchText: { color: '#667085', fontSize: 13 },
  suggestionList: { borderWidth: 1, borderColor: '#d8e0e8', borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden' },
  suggestion: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#eef1f4' },
  suggestionText: { flex: 1, color: '#344054', fontSize: 14 },
  addressSearchError: { color: '#667085', fontSize: 12, paddingHorizontal: 4 },
  button: { minHeight: 50, backgroundColor: FORM_PRIMARY, paddingVertical: Spacing.three, borderRadius: Spacing.two, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.one },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: FORM_PRIMARY },
  backButtonText: { color: FORM_PRIMARY, fontSize: 16, fontWeight: '700' },
  error: { color: '#b42318', backgroundColor: '#fef3f2', padding: 12, borderRadius: 8, fontSize: 14 },
  verificationPanel: { gap: Spacing.two, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#c9dced', backgroundColor: '#f5faff' },
  verificationTitle: { color: '#202b36', fontSize: 16, fontWeight: '700' },
  verificationMessage: { color: '#475467', fontSize: 14 },
  resendText: { color: FORM_PRIMARY, fontWeight: '600', paddingVertical: 6 },
  row: { flexDirection: 'row', gap: Spacing.two },
  halfButton: { flex: 1 },
  disabled: { opacity: 0.6 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 20 },
  modalContent: { width: '100%', maxWidth: 440, backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.two, color: '#202b36' },
  stateList: { maxHeight: 360 },
  stateItem: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  stateName: { color: '#344054', fontSize: 15 },
  retryText: { color: FORM_PRIMARY, marginTop: 12, fontWeight: '600' },
});
