import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient, { apiOrigin } from '@/api/apiClient';
import { clearSession } from '@/api/session';
import { formatApiFailure } from '@/api/work';
import { Skeleton } from '@/components/ui/Skeleton';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';
import { SHARE_MESSAGE, SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/constants/support';
import useAuthStore from '@/store/authStore';

type ProfileSummary = {
  first_name?: string;
  last_name?: string;
  email?: string;
  title?: string | null;
  dp?: string | null;
};

const profileOptions = [
  { section: 'my-profile', title: 'My Profile', icon: 'person-outline' },
  { section: 'my-shifts', title: 'My Shifts', icon: 'event-note' },
  { section: 'timesheets', title: 'TimeSheets', icon: 'access-time' },
  { section: 'earnings', title: 'My Earnings', icon: 'attach-money' },
  { section: 'support', title: 'Support', icon: 'headset-mic' },
  { section: 'share', title: 'Share with others', icon: 'share' },
  { section: 'settings', title: 'Settings', icon: 'settings' },
  { section: 'employment-history', title: 'Employment History', icon: 'history' },
  { section: 'education', title: 'Education', icon: 'school' },
  { section: 'attachments', title: 'Attachment', icon: 'attach-file' },
  { section: 'licenses', title: 'Licenses', icon: 'badge' },
] as const;

function responseError(response: { status?: number; problem?: string; data?: unknown }, fallback: string) {
  return formatApiFailure(response, fallback);
}

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

export default function ProfileScreen() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const response = await apiClient.get<ProfileSummary>('/users/my_profile/');
      if (!response.ok) throw new Error(responseError(response, 'Unable to load your profile'));
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('The server returned invalid profile information.');
      }
      setProfile(response.data);
      setImageFailed(false);
    } catch (loadError) {
      setProfileError(loadError instanceof Error ? loadError.message : 'Unable to load your profile.');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadProfile();
  }, [loadProfile]));

  const openSupport = async () => {
    try {
      const canOpen = await Linking.canOpenURL(SUPPORT_MAILTO);
      if (!canOpen) {
        Alert.alert('Support', `Email us at ${SUPPORT_EMAIL}`);
        return;
      }
      await Linking.openURL(SUPPORT_MAILTO);
    } catch {
      Alert.alert('Support', `Email us at ${SUPPORT_EMAIL}`);
    }
  };

  const shareApp = async () => {
    try {
      await Share.share({
        message: SHARE_MESSAGE,
        title: 'IsentCare',
      });
    } catch {
      Alert.alert('Unable to share', 'Please try sharing again.');
    }
  };

  const onLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSigningOut(true);
            try {
              await clearSession();
              router.replace('/(auth)/sign-in');
            } catch (logoutError) {
              Alert.alert(
                'Unable to sign out',
                logoutError instanceof Error
                  ? `Your saved session could not be removed: ${logoutError.message}`
                  : 'Your saved session could not be removed. Please try again.',
              );
            } finally {
              setSigningOut(false);
            }
          })();
        },
      },
    ]);
  };

  const navigateTo = (section: (typeof profileOptions)[number]['section']) => {
    if (section === 'my-shifts') {
      router.push('/(tabs)/profile/my-shifts');
    } else if (section === 'support') {
      void openSupport();
    } else if (section === 'share') {
      void shareApp();
    } else {
      router.push({ pathname: '/(tabs)/profile/details', params: { section } });
    }
  };

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Professional';
  const profileImage = profile?.dp ? imageUrl(profile.dp) : null;
  const headers = imageHeaders(profileImage, token);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            {profileLoading ? (
              <Skeleton style={styles.avatarSkeleton} />
            ) : profileImage && !imageFailed ? (
              <Image
                accessibilityLabel={`${displayName} profile photo`}
                source={{ uri: profileImage, headers }}
                style={styles.avatarImage}
                onError={() => setImageFailed(true)}
              />
            ) : (
              <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.profileDetails}>
            {profileLoading ? (
              <>
                <Skeleton style={{ width: '68%', height: 18 }} />
                <Skeleton style={{ width: '88%', height: 13 }} />
                <Skeleton style={{ width: '46%', height: 12 }} />
              </>
            ) : profileError ? (
              <>
                <Text accessibilityRole="alert" style={styles.errorText}>{profileError}</Text>
                <Pressable accessibilityRole="button" onPress={() => void loadProfile()}>
                  <Text style={styles.actionText}>Try again</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
                <Text style={styles.profileEmail} numberOfLines={1}>{profile?.email || 'Email unavailable'}</Text>
                {profile?.title ? <Text style={styles.profileTitle} numberOfLines={1}>{profile.title}</Text> : null}
              </>
            )}
          </View>
        </View>

        <View style={styles.menuCard}>
          {profileOptions.map((option, index) => (
            <View key={option.section}>
              {index > 0 ? <View style={styles.menuDivider} /> : null}
              <Pressable
                accessibilityRole="button"
                style={styles.menuItem}
                onPress={() => navigateTo(option.section)}>
                <MaterialIcons name={option.icon} size={22} color={FORM_PRIMARY} />
                <Text style={styles.menuLabel}>{option.title}</Text>
                {option.section === 'support' || option.section === 'share'
                  ? <MaterialIcons name="open-in-new" size={18} color="#98a2b3" />
                  : <MaterialIcons name="chevron-right" size={22} color="#98a2b3" />}
              </Pressable>
            </View>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          style={styles.logoutButton}
          onPress={onLogout}
          disabled={signingOut}>
          {signingOut
            ? <ActivityIndicator color="#b42318" />
            : <MaterialIcons name="logout" size={21} color="#b42318" />}
          <Text style={styles.logoutText}>{signingOut ? 'Signing out…' : 'Logout'}</Text>
          {!signingOut ? <MaterialIcons name="chevron-right" size={22} color="#98a2b3" /> : null}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 18, gap: 16 },
  title: { color: '#263341', fontSize: 24, fontWeight: '700' },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 12, backgroundColor: '#f5f8fb' },
  avatar: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 32, backgroundColor: '#eaf3fb' },
  avatarImage: { width: '100%', height: '100%' },
  avatarSkeleton: { width: '100%', height: '100%', borderRadius: 32 },
  avatarInitial: { color: FORM_PRIMARY, fontSize: 25, fontWeight: '700' },
  profileDetails: { flex: 1, gap: 7 },
  profileName: { color: '#263341', fontSize: 17, fontWeight: '700' },
  profileEmail: { color: '#667085', fontSize: 13 },
  profileTitle: { color: '#667085', fontSize: 12 },
  menuCard: { paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7edf3' },
  menuItem: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuLabel: { flex: 1, color: '#344054', fontSize: 15, fontWeight: '500' },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e4e7ec' },
  logoutButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#fff5f5', marginBottom: 8 },
  logoutText: { flex: 1, color: '#b42318', fontSize: 15, fontWeight: '600' },
  errorText: { color: '#b42318', fontSize: 14 },
  actionText: { color: FORM_PRIMARY, fontWeight: '700' },
});
