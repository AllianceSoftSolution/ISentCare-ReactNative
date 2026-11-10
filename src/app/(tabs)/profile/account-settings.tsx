import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
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
  Switch,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient, { apiOrigin } from '@/api/apiClient';
import {
  fetchAddressSuggestions,
  fetchPlaceAddressDetails,
  hasPlacesApiKey,
  type AddressSuggestion,
} from '@/api/places';
import {
  fetchAccountProfile,
  fetchNotificationPreferences,
  normalizeAddressStateId,
  readAddressCoordinates,
  updateAddress,
  updateNotificationPreference,
  updatePassword,
  updateProfilePhoto,
  type AccountProfile,
  type NotificationPreferences,
  type UserAddress,
} from '@/api/settings';
import { FORM_PRIMARY, IconTextInput } from '@/components/ui/RegistrationFields';
import { ScreenHeader, ScreenHeaderRefresh } from '@/components/ui/ScreenHeader';
import { Skeleton, SkeletonLines } from '@/components/ui/Skeleton';
import { Spacing } from '@/constants/theme';
import useAuthStore from '@/store/authStore';
import type { SelectedUpload } from '@/utils/upload';

type StateOption = { id: number; name: string };

const fieldColors = {
  backgroundColor: '#f5f8fb',
  textColor: '#263341',
};

function imageUrl(path: string) {
  return /^https?:\/\//i.test(path)
    ? path
    : `${apiOrigin}${path.startsWith('/') ? '' : '/'}${path}`;
}

function imageHeaders(image: string | null, token: string | null) {
  if (!image || !token) return undefined;
  try {
    return new URL(image).origin === new URL(apiOrigin).origin
      ? { Authorization: `Bearer ${token}` }
      : undefined;
  } catch {
    return undefined;
  }
}

function isUserAddress(value: AccountProfile['address']): value is UserAddress {
  return !!value && typeof value === 'object' && typeof (value as UserAddress).id === 'number';
}

export default function AccountSettingsScreen() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [prefBusyKey, setPrefBusyKey] = useState<keyof Omit<NotificationPreferences, 'id'> | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  const [photo, setPhoto] = useState<SelectedUpload | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [selectedState, setSelectedState] = useState<StateOption | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [addressSelected, setAddressSelected] = useState(true);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);
  const [addressSearchError, setAddressSearchError] = useState<string | null>(null);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressMessage, setAddressMessage] = useState<string | null>(null);

  const [states, setStates] = useState<StateOption[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [statesError, setStatesError] = useState<string | null>(null);
  const [statePickerOpen, setStatePickerOpen] = useState(false);

  const busy = useRef(false);
  const requestId = useRef(0);

  const applyProfileToForm = useCallback((next: AccountProfile, stateList: StateOption[]) => {
    setProfile(next);
    setImageFailed(false);
    setPhoto(null);
    if (!isUserAddress(next.address)) {
      setAddress('');
      setCity('');
      setZipCode('');
      setSelectedState(null);
      setLatitude(null);
      setLongitude(null);
      return;
    }

    const coords = readAddressCoordinates(next.address);
    setAddress(next.address.address || '');
    setCity(next.address.city || '');
    setZipCode(String(next.address.zip_code || '').replace(/\D/g, '').slice(0, 5));
    setLatitude(coords.latitude);
    setLongitude(coords.longitude);
    setAddressSelected(true);

    const stateId = normalizeAddressStateId(next.address.state);
    if (stateId != null) {
      const match = stateList.find((item) => item.id === stateId);
      if (match) {
        setSelectedState(match);
      } else if (typeof next.address.state === 'object' && next.address.state?.name) {
        setSelectedState({ id: stateId, name: next.address.state.name });
      } else {
        setSelectedState({ id: stateId, name: `State #${stateId}` });
      }
    } else {
      setSelectedState(null);
    }
  }, []);

  const loadStates = useCallback(async () => {
    setStatesLoading(true);
    setStatesError(null);
    try {
      const response = await apiClient.get<StateOption[] | { results?: StateOption[] }>(
        '/states/?page=1&page_size=500',
      );
      if (!response.ok) {
        throw new Error(
          response.problem === 'NETWORK_ERROR'
            || response.problem === 'TIMEOUT_ERROR'
            || response.problem === 'CONNECTION_ERROR'
            ? 'No internet connection. Check your connection and try again.'
            : 'Unable to load states. Please try again.',
        );
      }
      const data = response.data;
      const list = Array.isArray(data) ? data : data?.results;
      if (!list) throw new Error('The server returned an invalid state list.');
      setStates(list);
      return list;
    } catch (loadError) {
      setStatesError(loadError instanceof Error ? loadError.message : 'Unable to load states.');
      return [] as StateOption[];
    } finally {
      setStatesLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const active = ++requestId.current;
    setLoading(true);
    setError(null);
    setPasswordMessage(null);
    setPhotoMessage(null);
    setAddressMessage(null);
    try {
      const [stateList, nextProfile, nextPrefs] = await Promise.all([
        loadStates(),
        fetchAccountProfile(),
        fetchNotificationPreferences(),
      ]);
      if (active !== requestId.current) return;
      applyProfileToForm(nextProfile, stateList);
      setPrefs(nextPrefs);
    } catch (loadError) {
      if (active === requestId.current) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load account settings.');
      }
    } finally {
      if (active === requestId.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [applyProfileToForm, loadStates]);

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => void load(), 0);
      return () => {
        clearTimeout(timer);
        requestId.current += 1;
        busy.current = false;
      };
    }, [load]),
  );

  useEffect(() => {
    let active = true;
    const query = address.trim();
    if (addressSelected || query.length < 3) {
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
  }, [address, addressSelected]);

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
      if (typeof details.latitude === 'number') setLatitude(details.latitude);
      if (typeof details.longitude === 'number') setLongitude(details.longitude);
      if (details.stateLong || details.stateShort) {
        const match = states.find((state) => (
          state.name === details.stateLong || state.name === details.stateShort
        ));
        if (match) {
          setSelectedState(match);
        } else {
          const loaded = await loadStates();
          const loadedMatch = loaded.find((state) => (
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

  const onTogglePreference = async (
    key: keyof Omit<NotificationPreferences, 'id'>,
    value: boolean,
  ) => {
    if (!prefs || prefBusyKey) return;
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    setPrefBusyKey(key);
    try {
      const updated = await updateNotificationPreference(previous, key, value);
      setPrefs(updated);
    } catch (toggleError) {
      setPrefs(previous);
      Alert.alert(
        'Unable to update',
        toggleError instanceof Error ? toggleError.message : 'Unable to update notification preferences.',
      );
    } finally {
      setPrefBusyKey(null);
    }
  };

  const onSavePassword = async () => {
    if (!profile || passwordBusy) return;
    const next = password;
    if (next.length < 8) {
      setPasswordMessage('Password must be at least 8 characters.');
      return;
    }
    if (next !== confirmPassword) {
      setPasswordMessage('Passwords do not match.');
      return;
    }
    setPasswordBusy(true);
    setPasswordMessage(null);
    try {
      await updatePassword(profile.id, next);
      setPassword('');
      setConfirmPassword('');
      setPasswordMessage('Password updated.');
    } catch (saveError) {
      setPasswordMessage(saveError instanceof Error ? saveError.message : 'Unable to update password.');
    } finally {
      setPasswordBusy(false);
    }
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      setPhoto({
        uri: asset.uri,
        name: asset.fileName || 'profile-photo.jpg',
        mimeType: asset.mimeType,
        file: asset.file,
      });
      setPhotoMessage(null);
      setImageFailed(false);
    }
  };

  const onSavePhoto = async () => {
    if (!profile || !photo || photoBusy) return;
    setPhotoBusy(true);
    setPhotoMessage(null);
    try {
      await updateProfilePhoto(profile.id, photo);
      const refreshed = await fetchAccountProfile();
      applyProfileToForm(refreshed, states);
      setPhotoMessage('Profile photo updated.');
    } catch (saveError) {
      setPhotoMessage(saveError instanceof Error ? saveError.message : 'Unable to update photo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const onSaveAddress = async () => {
    if (!profile || addressBusy) return;
    if (!isUserAddress(profile.address)) {
      setAddressMessage('No saved address was found for your account.');
      return;
    }
    if (!address.trim() || !city.trim() || !selectedState || zipCode.trim().length !== 5) {
      setAddressMessage('Enter address, city, state, and a 5-digit ZIP code.');
      return;
    }
    if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setAddressMessage('Select an address suggestion so location coordinates can be saved.');
      return;
    }

    setAddressBusy(true);
    setAddressMessage(null);
    try {
      await updateAddress(profile.address.id, {
        address: address.trim(),
        city: city.trim(),
        state: selectedState.id,
        zip_code: zipCode.trim(),
        latitude,
        longitude,
      });
      const refreshed = await fetchAccountProfile();
      applyProfileToForm(refreshed, states);
      setAddressMessage('Address updated.');
    } catch (saveError) {
      setAddressMessage(saveError instanceof Error ? saveError.message : 'Unable to update address.');
    } finally {
      setAddressBusy(false);
    }
  };

  const currentPhoto = photo?.uri
    || (profile?.dp ? imageUrl(profile.dp) : null);
  const headers = photo ? undefined : imageHeaders(currentPhoto, token);
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Professional';

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <ScreenHeader
        title="Settings"
        onBack={() => router.back()}
        right={<ScreenHeaderRefresh onPress={() => void load()} disabled={loading} />}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {loading ? (
            <View style={styles.loadingBlock}>
              <Skeleton style={{ width: '42%', height: 18 }} />
              <SkeletonLines count={4} />
              <Skeleton style={{ width: '100%', height: 120, borderRadius: 12 }} />
            </View>
          ) : error ? (
            <View style={styles.errorBlock}>
              <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={() => void load()}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Notification preferences</Text>
                <Text style={styles.cardHint}>
                  These control email and in-app alerts from your account. Device push delivery is not wired yet.
                </Text>
                {(
                  [
                    ['application_status', 'Application status updates'],
                    ['upcoming_shift', 'Upcoming shift reminders'],
                    ['new_job', 'New job alerts'],
                  ] as const
                ).map(([key, label]) => (
                  <View key={key} style={styles.prefRow}>
                    <Text style={styles.prefLabel}>{label}</Text>
                    <Switch
                      value={!!prefs?.[key]}
                      disabled={!prefs || prefBusyKey !== null}
                      onValueChange={(value) => void onTogglePreference(key, value)}
                      trackColor={{ true: FORM_PRIMARY }}
                    />
                  </View>
                ))}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Profile photo</Text>
                <View style={styles.photoRow}>
                  <View style={styles.avatar}>
                    {currentPhoto && !imageFailed ? (
                      <Image
                        accessibilityLabel={`${displayName} profile photo`}
                        source={{ uri: currentPhoto, headers }}
                        style={styles.avatarImage}
                        onError={() => setImageFailed(true)}
                      />
                    ) : (
                      <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <View style={styles.photoActions}>
                    <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => void pickPhoto()}>
                      <MaterialIcons name="photo-camera" size={18} color={FORM_PRIMARY} />
                      <Text style={styles.secondaryButtonText}>{photo ? 'Change selected photo' : 'Choose photo'}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      style={[styles.primaryButton, (!photo || photoBusy) && styles.buttonDisabled]}
                      disabled={!photo || photoBusy}
                      onPress={() => void onSavePhoto()}>
                      {photoBusy
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.primaryButtonText}>Save photo</Text>}
                    </Pressable>
                  </View>
                </View>
                {photoMessage ? (
                  <Text style={photoMessage.includes('updated') ? styles.successText : styles.errorText}>
                    {photoMessage}
                  </Text>
                ) : null}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Change password</Text>
                <IconTextInput
                  {...fieldColors}
                  icon="lock"
                  placeholder="New password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!passwordBusy}
                />
                <IconTextInput
                  {...fieldColors}
                  icon="lock-outline"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!passwordBusy}
                />
                <Pressable
                  accessibilityRole="button"
                  style={[styles.primaryButton, passwordBusy && styles.buttonDisabled]}
                  disabled={passwordBusy}
                  onPress={() => void onSavePassword()}>
                  {passwordBusy
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.primaryButtonText}>Update password</Text>}
                </Pressable>
                {passwordMessage ? (
                  <Text style={passwordMessage.includes('updated') ? styles.successText : styles.errorText}>
                    {passwordMessage}
                  </Text>
                ) : null}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Address</Text>
                {!isUserAddress(profile?.address) ? (
                  <Text style={styles.cardHint}>No address is on file for this account yet.</Text>
                ) : (
                  <>
                    <IconTextInput
                      {...fieldColors}
                      icon="place"
                      placeholder="Street address *"
                      value={address}
                      onChangeText={(value) => {
                        setAddress(value);
                        setAddressSelected(false);
                        setAddressMessage(null);
                        if (!value.trim()) setAddressSuggestions([]);
                      }}
                      editable={!addressBusy}
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
                            style={styles.suggestionRow}
                            onPress={() => void onSelectAddressSuggestion(suggestion)}>
                            <MaterialIcons name="place" size={19} color={FORM_PRIMARY} />
                            <Text style={styles.suggestionText}>{suggestion.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    {addressSearchError ? <Text style={styles.addressSearchError}>{addressSearchError}</Text> : null}
                    {!hasPlacesApiKey() ? (
                      <Text style={styles.cardHint}>
                        Address suggestions are unavailable. Enter your full address manually and keep existing coordinates.
                      </Text>
                    ) : null}

                    <IconTextInput
                      {...fieldColors}
                      icon="location-city"
                      placeholder="City *"
                      value={city}
                      onChangeText={setCity}
                      editable={!addressBusy}
                    />
                    <Pressable
                      accessibilityRole="button"
                      style={styles.stateField}
                      disabled={addressBusy || statesLoading}
                      onPress={() => {
                        if (!states.length) void loadStates();
                        setStatePickerOpen(true);
                      }}>
                      <MaterialIcons name="map" size={20} color="#6b7280" />
                      <Text style={[styles.stateFieldText, !selectedState && styles.statePlaceholder]}>
                        {selectedState?.name || (statesLoading ? 'Loading states…' : 'State *')}
                      </Text>
                      <MaterialIcons name="expand-more" size={22} color="#98a2b3" />
                    </Pressable>
                    {statesError ? <Text style={styles.errorText}>{statesError}</Text> : null}
                    <IconTextInput
                      {...fieldColors}
                      icon="markunread-mailbox"
                      placeholder="ZIP code *"
                      value={zipCode}
                      onChangeText={(value) => setZipCode(value.replace(/\D/g, '').slice(0, 5))}
                      keyboardType="number-pad"
                      maxLength={5}
                      editable={!addressBusy}
                    />
                    <Text style={styles.cardHint}>
                      Coordinates: {latitude != null && longitude != null
                        ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                        : 'missing — pick a suggestion to set them'}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      style={[styles.primaryButton, addressBusy && styles.buttonDisabled]}
                      disabled={addressBusy}
                      onPress={() => void onSaveAddress()}>
                      {addressBusy
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.primaryButtonText}>Save address</Text>}
                    </Pressable>
                    {addressMessage ? (
                      <Text style={addressMessage.includes('updated') ? styles.successText : styles.errorText}>
                        {addressMessage}
                      </Text>
                    ) : null}
                  </>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={statePickerOpen} animationType="slide" transparent onRequestClose={() => setStatePickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setStatePickerOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select state</Text>
            <ScrollView>
              {states.map((state) => (
                <Pressable
                  key={state.id}
                  accessibilityRole="button"
                  style={styles.modalRow}
                  onPress={() => {
                    setSelectedState(state);
                    setStatePickerOpen(false);
                  }}>
                  <Text style={styles.modalRowText}>{state.name}</Text>
                  {selectedState?.id === state.id
                    ? <MaterialIcons name="check" size={20} color={FORM_PRIMARY} />
                    : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  container: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: 18,
    gap: 16,
    paddingBottom: 32,
  },
  loadingBlock: { gap: 14 },
  errorBlock: { gap: 10, paddingVertical: 24 },
  card: {
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7edf3',
    backgroundColor: '#fff',
  },
  cardTitle: { color: '#263341', fontSize: 17, fontWeight: '700' },
  cardHint: { color: '#667085', fontSize: 13, lineHeight: 18 },
  prefRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  prefLabel: { flex: 1, color: '#344054', fontSize: 15, fontWeight: '500' },
  photoRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eaf3fb',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { color: FORM_PRIMARY, fontSize: 28, fontWeight: '700' },
  photoActions: { flex: 1, gap: 10 },
  primaryButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: FORM_PRIMARY,
    paddingHorizontal: 14,
  },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: FORM_PRIMARY,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
  },
  secondaryButtonText: { color: FORM_PRIMARY, fontSize: 14, fontWeight: '700' },
  buttonDisabled: { opacity: 0.55 },
  successText: { color: '#027a48', fontSize: 13 },
  errorText: { color: '#b42318', fontSize: 13 },
  retryText: { color: FORM_PRIMARY, fontWeight: '700', paddingVertical: 4 },
  addressSearchStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addressSearchText: { color: '#667085', fontSize: 13 },
  addressSearchError: { color: '#667085', fontSize: 12 },
  suggestionList: {
    borderWidth: 1,
    borderColor: '#e7edf3',
    borderRadius: 10,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e7edf3',
  },
  suggestionText: { flex: 1, color: '#344054', fontSize: 14 },
  stateField: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f5f8fb',
  },
  stateFieldText: { flex: 1, color: '#263341', fontSize: 15 },
  statePlaceholder: { color: '#7b8490' },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  modalSheet: {
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  modalTitle: {
    color: '#263341',
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  modalRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  modalRowText: { color: '#344054', fontSize: 15 },
});
