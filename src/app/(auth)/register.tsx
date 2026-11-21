import { useRouter } from 'expo-router';
import { RegisterError, register, requestSignupOtp, verifySignupOtp } from '@/api/auth';
import { saveSessionTokens } from '@/api/session';
import apiClient from '@/api/apiClient';
import { networkReachabilityMessage } from '@/api/work';
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
import {
  formatPhoneNumber,
  isValidUsPhone,
  normalizePhoneInput,
  phoneDigits,
  US_PHONE_ERROR,
  US_PHONE_INPUT_MAX_LENGTH,
} from '@/utils/phone';
import {
  formatMaskedSsn,
  isValidSsn,
  SSN_ERROR,
  SSN_INPUT_MAX_LENGTH,
  ssnDigits,
  ssnDigitsFromChange,
} from '@/utils/ssn';
import {
  fetchAddressSuggestions,
  fetchPlaceAddressDetails,
  hasPlacesApiKey,
  type AddressSuggestion,
} from '@/api/places';
import { MaterialIcons } from '@expo/vector-icons';

type StateOption = { id: number; name: string };
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
  const [accountCreated, setAccountCreated] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [otpRemainingSeconds, setOtpRemainingSeconds] = useState(0);
  const formLocked = accountCreated;
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

    if (formLocked || addressSelected || query.length < 3) {
      return;
    }

    if (!hasPlacesApiKey()) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAddressSearchLoading(true);
      setAddressSearchError(null);
      try {
        const suggestions = await fetchAddressSuggestions(query, controller.signal);
        if (!active) return;
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
  }, [address, addressSelected, formLocked]);

  const onSelectAddressSuggestion = async (suggestion: AddressSuggestion) => {
    setAddress(suggestion.label);
    setAddressSelected(true);
    setAddressSuggestions([]);
    setAddressSearchLoading(true);
    setAddressSearchError(null);
    Keyboard.dismiss();
    try {
      const details = await fetchPlaceAddressDetails(suggestion.id);
      if (details.address) setAddress(details.address);
      if (details.city) setCity(details.city);
      if (details.zipCode) setZipCode(details.zipCode.replace(/\D/g, '').slice(0, 5));
      if (details.stateLong || details.stateShort) {
        const match = states.find((state) => (
          state.name === details.stateLong || state.name === details.stateShort
        ));
        if (match) {
          setSelectedState(match);
        } else if (!states.length) {
          // States may not be loaded yet; load and then match like the website form.
          const response = await apiClient.get<StateOption[] | { results?: StateOption[] }>(
            '/states/?page=1&page_size=500',
          );
          const data = response.data;
          const nextStates = Array.isArray(data)
            ? data
            : Array.isArray(data?.results)
              ? data.results
              : [];
          setStates(nextStates);
          const loadedMatch = nextStates.find((state) => (
            state.name === details.stateLong || state.name === details.stateShort
          ));
          if (loadedMatch) setSelectedState(loadedMatch);
        }
      }
    } catch (detailsError) {
      setAddressSearchError(
        detailsError instanceof Error
          ? `${detailsError.message} Address text was applied; fill city, state, and ZIP if needed.`
          : 'Address text was applied; fill city, state, and ZIP if needed.',
      );
    } finally {
      setAddressSearchLoading(false);
    }
  };

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
            ? networkReachabilityMessage(response.problem)
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

  const sendSignupOtp = async () => {
    await requestSignupOtp(email, phone);
    setVerificationEmail(email.trim());
    setVerificationCode('');
    setOtpSent(true);
    startOtpCountdown();
  };

  const onResendSignupOtp = async () => {
    if (!accountCreated) {
      setError('Create your account first, then request a verification code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await sendSignupOtp();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not resend the verification code.');
    } finally {
      setLoading(false);
    }
  };

  const createInactiveAccount = async (formattedDob: string, stateId: number) => {
    if (!coordinates) {
      throw new Error('Location is required to complete registration. Go back to Job Type and try again.');
    }
    await register(
      {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phoneDigits(phone),
        password,
        dob: formattedDob,
        ssn: ssnDigits(ssn),
        address: address.trim(),
        city: city.trim(),
        state: stateId,
        zip_code: zipCode.trim(),
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        type: 'P',
        title: title.trim(),
        per_diem: perDiem,
      },
      idImage,
    );
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
    if (!isValidUsPhone(phone)) {
      setError(US_PHONE_ERROR);
      return;
    }
    if (!/^\d{5}$/.test(zipCode)) {
      setError('ZIP code must contain exactly 5 digits.');
      return;
    }
    if (!isValidSsn(ssn)) {
      setError(SSN_ERROR);
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (/^\d+$/.test(password)) {
      setError('Password cannot be entirely numeric.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (otpSent && otpRemainingSeconds === 0) {
      setError('Your verification code has expired. Request a new code to continue.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // 1) Create the inactive account first (website/backend contract).
      if (!accountCreated) {
        try {
          await createInactiveAccount(formattedDob, selectedState.id);
          setAccountCreated(true);
        } catch (createError) {
          // Incomplete prior signup: resume at OTP when the email already exists inactive.
          if (createError instanceof RegisterError && createError.fields.email) {
            try {
              await sendSignupOtp();
              setAccountCreated(true);
              return;
            } catch (resumeError) {
              throw resumeError instanceof Error ? resumeError : createError;
            }
          }
          throw createError;
        }
      }

      // 2) Send OTP after the account exists.
      if (!otpSent) {
        await sendSignupOtp();
        return;
      }

      // 3) Verify OTP → activate + JWT session → continue onboarding.
      if (!/^\d{5}$/.test(verificationCode.trim())) {
        setError('Enter the 5-digit verification code sent to your email.');
        return;
      }
      const tokens = await verifySignupOtp(verificationEmail || email, verificationCode);
      await saveSessionTokens(tokens);
      // Navigate immediately. Alert.alert is unreliable on web (no Continue button),
      // which left verified users stuck on this screen.
      router.replace('/');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Registration failed.';
      if (message.toLowerCase().includes('expired')) {
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
            <Pressable style={styles.imageUpload} onPress={() => void pickIdImage()} disabled={formLocked}>
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
              <Pressable onPress={() => setIdImage(null)} style={styles.removeImage} disabled={formLocked}>
                <MaterialIcons name="close" size={16} color="#b42318" />
                <Text style={styles.removeImageText}>Remove image</Text>
              </Pressable>
            ) : null}
            <IconTextInput {...fieldColors} icon="person" placeholder="First Name *" value={firstName} onChangeText={setFirstName} autoCapitalize="words" editable={!formLocked} />
            <IconTextInput {...fieldColors} icon="person-outline" placeholder="Last Name *" value={lastName} onChangeText={setLastName} autoCapitalize="words" editable={!formLocked} />
            <IconDateField {...fieldColors} placeholder="Date of Birth *" value={dob} onChange={setDob} editable={!formLocked} maximumDate={new Date()} />
            <IconTextInput
              {...fieldColors}
              icon="fingerprint"
              placeholder="SSN *"
              value={formatMaskedSsn(ssn)}
              onChangeText={(value) => setSsn(ssnDigitsFromChange(ssn, value))}
              keyboardType="number-pad"
              maxLength={SSN_INPUT_MAX_LENGTH}
              editable={!formLocked}
            />
            <IconTextInput {...fieldColors} icon="email" placeholder="Email *" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" editable={!formLocked} />
            <IconTextInput
              {...fieldColors}
              icon="phone"
              placeholder="Phone Number *"
              value={formatPhoneNumber(phone)}
              onChangeText={(value) => setPhone(normalizePhoneInput(value))}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              maxLength={US_PHONE_INPUT_MAX_LENGTH}
              editable={!formLocked}
            />
            <IconTextInput {...fieldColors} icon="lock" placeholder="Password *" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" editable={!formLocked} />
            <IconTextInput {...fieldColors} icon="lock-outline" placeholder="Confirm Password *" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" editable={!formLocked} />
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
                  value.trim().length >= 3 && !hasPlacesApiKey()
                    ? 'Address suggestions are unavailable. Enter your full address manually.'
                    : null,
                );
              }}
              autoCapitalize="words"
              editable={!formLocked}
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
                    onPress={() => void onSelectAddressSuggestion(suggestion)}>
                    <MaterialIcons name="place" size={19} color={FORM_PRIMARY} />
                    <Text style={styles.suggestionText}>{suggestion.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {addressSearchError ? <Text style={styles.addressSearchError}>{addressSearchError}</Text> : null}
            <IconTextInput {...fieldColors} icon="location-city" placeholder="City *" value={city} onChangeText={setCity} autoCapitalize="words" editable={!formLocked} />
            <Pressable style={[styles.selectField, { backgroundColor: colors.backgroundElement }]} onPress={onOpenStatePicker} disabled={formLocked}>
              <MaterialIcons name="map" size={20} color="#6b7280" />
              <Text style={[styles.selectText, { color: selectedState ? colors.text : '#7b8490' }]}>
                {selectedState?.name || 'Select State *'}
              </Text>
              <MaterialIcons name="arrow-drop-down" size={22} color="#6b7280" />
            </Pressable>
            <IconTextInput {...fieldColors} icon="markunread-mailbox" placeholder="Zip / Postal Code *" value={zipCode} onChangeText={(value) => setZipCode(value.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" maxLength={5} editable={!formLocked} />
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
              <Pressable
                style={[styles.button, styles.halfButton, styles.backButton, formLocked && styles.disabled]}
                onPress={() => {
                  if (formLocked) {
                    setError('Your account is already created. Enter the verification code to continue.');
                    return;
                  }
                  setError(null);
                  setStep(0);
                }}
                disabled={loading}>
                <Text style={styles.backButtonText}>Previous</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.halfButton, loading && styles.disabled]} onPress={() => void onSubmit()} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    {otpSent ? 'Verify & Continue' : 'Continue'}
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
