import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiClient, { apiOrigin, professionalApiClient } from '@/api/apiClient';
import { fetchEarningsReport, type EarningsMonth } from '@/api/notifications';
import { formatApiFailure, formatMoney, formatShiftTiming, formatWorkDate } from '@/api/work';
import { EditableProfileRecords } from '@/components/profile/EditableProfileRecords';
import { EarningsChart } from '@/components/ui/EarningsChart';
import { Skeleton, SkeletonLines } from '@/components/ui/Skeleton';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';
import { ScreenHeader, ScreenHeaderRefresh } from '@/components/ui/ScreenHeader';
import useAuthStore from '@/store/authStore';
import { formatPhoneNumber, phoneDigits } from '@/utils/phone';

const editableSections = new Set(['employment-history', 'education', 'licenses', 'attachments']);

type DataRecord = Record<string, unknown>;
type ProfileData = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  title?: string | null;
  dp?: string | null;
  address?: { address?: string; city?: string; zip_code?: string; state?: string | number } | null;
};
type PageState = { results: DataRecord[]; hasMore: boolean };

const sectionTitles: Record<string, string> = {
  'my-profile': 'My Profile',
  timesheets: 'Time Sheets',
  earnings: 'My Earnings',
  'employment-history': 'Employment History',
  education: 'Education',
  attachments: 'Attachment',
  licenses: 'Licenses',
  references: 'Applicant Reference Check',
  settings: 'Settings',
};

const settingsSections = [
  { section: 'employment-history', title: 'Work Experience', icon: 'work-outline' },
  { section: 'education', title: 'Education', icon: 'school' },
  { section: 'attachments', title: 'Attachment', icon: 'attach-file' },
  { section: 'licenses', title: 'Licenses', icon: 'badge' },
  { section: 'references', title: 'Applicant Reference Check', icon: 'people-outline' },
] as const;

const recordFields: Record<string, [string, string][]> = {
  'employment-history': [
    ['company', 'Employer'],
    ['job_title', 'Job title'],
    ['supervisor', 'Supervisor'],
    ['telephone', 'Telephone'],
    ['address', 'Address'],
    ['duration', 'Duration (years)'],
    ['from_date', 'From'],
    ['to_date', 'To'],
    ['leaving_reason', 'Reason for leaving'],
  ],
  education: [
    ['institute', 'Institute'],
    ['degree', 'Degree'],
    ['majors', 'Major'],
    ['state', 'State'],
    ['duration', 'Duration (years)'],
    ['start_date', 'From'],
    ['end_date', 'To'],
    ['graduated', 'Graduated'],
    ['country', 'Country'],
    ['city', 'City'],
  ],
  licenses: [
    ['profession', 'Profession'],
    ['number', 'License number'],
    ['state', 'State'],
    ['primary_state', 'Primary state'],
    ['expiry_date', 'Expiry date'],
  ],
  references: [
    ['name', 'Name'],
    ['job_title', 'Job title'],
    ['employer', 'Employer'],
    ['position', 'Position'],
    ['contact_person', 'Contact person'],
    ['email', 'Email'],
    ['phone', 'Phone'],
  ],
  timesheets: [
    ['facility', 'Facility'],
    ['position', 'Position'],
    ['date', 'Shift date'],
    ['timing', 'Shift'],
    ['total_hours', 'Hours'],
    ['punch_in', 'Start time'],
    ['punch_out', 'End time'],
    ['pay', 'Pay'],
  ],
  earnings: [
    ['facility', 'Facility'],
    ['position', 'Position'],
    ['date', 'Shift date'],
    ['total_hours', 'Hours'],
    ['pay', 'Pay'],
  ],
};

function extractRows(data: unknown): PageState {
  if (Array.isArray(data)) return { results: data.filter(isRecord), hasMore: false };
  if (isRecord(data) && Array.isArray(data.results)) {
    return {
      results: data.results.filter(isRecord),
      hasMore: Boolean(data.next),
    };
  }
  throw new Error('The server returned an invalid list.');
}

function isRecord(value: unknown): value is DataRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function responseError(response: { status?: number; problem?: string; data?: unknown }, fallback: string) {
  return formatApiFailure(response, fallback);
}

function displayValue(value: unknown, fieldKey?: string): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value);
    if (fieldKey === 'phone' || fieldKey === 'telephone') {
      const digits = phoneDigits(text);
      return digits ? formatPhoneNumber(digits) : text;
    }
    return text;
  }
  if (Array.isArray(value)) return value.map((item) => displayValue(item, fieldKey)).filter(Boolean).join(', ');
  if (isRecord(value)) {
    for (const key of ['name', 'title', 'label', 'address', 'value']) {
      if (value[key] !== undefined && value[key] !== null) return displayValue(value[key], fieldKey);
    }
  }
  return '';
}

function documentUrl(value: string) {
  return /^https?:\/\//i.test(value)
    ? value
    : `${apiOrigin}${value.startsWith('/') ? '' : '/'}${value}`;
}

function SkeletonCard() {
  return (
    <View style={styles.skeletonCard}>
      <Skeleton style={{ width: '48%', height: 17 }} />
      <SkeletonLines />
    </View>
  );
}

export default function ProfileDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const section = Array.isArray(params.section) ? params.section[0] : params.section || 'my-profile';
  const title = sectionTitles[section] || 'Profile';
  const token = useAuthStore((state) => state.token);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [completedShifts, setCompletedShifts] = useState<DataRecord[]>([]);
  const [records, setRecords] = useState<DataRecord[]>([]);
  const [earningsMonths, setEarningsMonths] = useState<EarningsMonth[]>([]);
  const [earningsYearTotal, setEarningsYearTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const page = useRef(1);
  const busy = useRef(false);
  const requestId = useRef(0);
  const isValidSection = Boolean(sectionTitles[section]);

  const loadSection = useCallback(async (nextPage = 1) => {
    if (busy.current) return;
    busy.current = true;
    const activeRequest = ++requestId.current;
    const isCurrentRequest = () => activeRequest === requestId.current;
    if (nextPage === 1) {
      setLoading(true);
      setError(null);
      setHasMore(false);
      page.current = 1;
      setRecords([]);
      setProfile(null);
      setCompletedShifts([]);
      setEarningsMonths([]);
      setEarningsYearTotal(0);
    } else {
      setLoadingMore(true);
    }
    try {
      if (section === 'my-profile') {
        const [profileResponse, completedResponse] = await Promise.all([
          apiClient.get<ProfileData>('/users/my_profile/'),
          professionalApiClient.get<unknown>('/shifts/completed_shifts/?page=1'),
        ]);
        if (!isCurrentRequest()) return;
        if (!profileResponse.ok) throw new Error(responseError(profileResponse, 'Unable to load your profile'));
        if (!profileResponse.data || !isRecord(profileResponse.data)) throw new Error('The server returned invalid profile information.');
        setProfile(profileResponse.data);
        if (completedResponse.ok) {
          setCompletedShifts(extractRows(completedResponse.data).results.slice(0, 5));
        } else {
          setCompletedShifts([]);
        }
      } else if (section === 'timesheets' || section === 'earnings') {
        const response = await professionalApiClient.get<unknown>(`/shifts/?page=${nextPage}`);
        if (!isCurrentRequest()) return;
        if (!response.ok) throw new Error(responseError(response, 'Unable to load your time sheets'));
        const result = extractRows(response.data);
        setRecords((current) => nextPage === 1 ? result.results : [...current, ...result.results]);
        setHasMore(result.hasMore);
        page.current = nextPage;
        if (section === 'earnings' && nextPage === 1) {
          try {
            const report = await fetchEarningsReport(new Date().getFullYear());
            if (!isCurrentRequest()) return;
            setEarningsMonths(report.months);
            setEarningsYearTotal(report.totalPay);
          } catch {
            if (isCurrentRequest()) {
              setEarningsMonths([]);
              setEarningsYearTotal(0);
            }
          }
        }
      } else if (editableSections.has(section) || section === 'settings') {
        // Editable sections load through EditableProfileRecords; settings is a menu.
        setRecords([]);
      } else {
        const endpoints: Record<string, string> = {
          references: '/references/',
        };
        const endpoint = endpoints[section];
        if (!endpoint) throw new Error('This profile page is not available.');
        const response = await professionalApiClient.get<unknown>(endpoint);
        if (!isCurrentRequest()) return;
        if (!response.ok) throw new Error(responseError(response, `Unable to load ${title.toLowerCase()}`));
        setRecords(extractRows(response.data).results);
      }
    } catch (loadError) {
      if (isCurrentRequest()) {
        setError(loadError instanceof Error ? loadError.message : `Unable to load ${title.toLowerCase()}.`);
      }
    } finally {
      if (isCurrentRequest()) {
        busy.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [section, title]);

  useFocusEffect(useCallback(() => {
    const request = setTimeout(() => void loadSection(), 0);
    return () => {
      clearTimeout(request);
      requestId.current += 1;
      busy.current = false;
    };
  }, [loadSection]));

  const profileImage = profile?.dp ? documentUrl(profile.dp) : null;
  const imageHeaders = (() => {
    if (!profileImage || !token) return undefined;
    try {
      return new URL(profileImage).origin === new URL(apiOrigin).origin
        ? { Authorization: `Bearer ${token}` }
        : undefined;
    } catch {
      return undefined;
    }
  })();
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Professional';
  const address = [profile?.address?.address, profile?.address?.city, displayValue(profile?.address?.state), profile?.address?.zip_code]
    .filter(Boolean)
    .join(', ');
  const visibleRecords = records.map((record) => {
    const fields = recordFields[section] || [];
    return fields.flatMap(([key, label]) => {
      if ((section === 'timesheets' || section === 'earnings') && (key === 'facility' || key === 'pay')) {
        return [];
      }
      const value = displayValue(record[key], key);
      return value ? [{ key, label, value }] : [];
    });
  });
  const earningsTotal = records.reduce((sum, record) => {
    if (record.pay === null || record.pay === undefined || record.pay === '') return sum;
    const value = Number(record.pay);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  const totalHours = records.reduce((sum, record) => {
    const value = typeof record.total_hours === 'string' ? record.total_hours.split(':') : [];
    const hours = Number(value[0]);
    const minutes = Number(value[1]);
    return sum + (Number.isFinite(hours) ? hours : 0) + (Number.isFinite(minutes) ? minutes / 60 : 0);
  }, 0);

  const softSurface = section === 'timesheets' || section === 'earnings';

  return (
    <SafeAreaView style={[styles.safeArea, softSurface && styles.softSafeArea]} edges={['left', 'right']}>
      <ScreenHeader
        title={title}
        onBack={() => router.back()}
        right={
          section === 'timesheets' || section === 'earnings' ? (
            <ScreenHeaderRefresh onPress={() => void loadSection()} disabled={loading} />
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.container}>
        {!isValidSection ? (
          <View style={styles.stateCard}><Text style={styles.errorText}>This profile page is not available.</Text></View>
        ) : editableSections.has(section) ? (
          <EditableProfileRecords
            section={section as 'employment-history' | 'education' | 'licenses' | 'attachments'}
          />
        ) : loading ? (
          <View style={styles.skeletonList}>
            {section === 'my-profile' ? (
              <>
                <View style={styles.profileSkeleton}>
                  <Skeleton style={styles.skeletonAvatar} />
                  <View style={styles.skeletonDetails}><Skeleton style={{ width: '65%', height: 17 }} /><Skeleton style={{ width: '85%', height: 13 }} /></View>
                </View>
                <SkeletonCard />
              </>
            ) : section === 'settings' ? (
              <SkeletonCard />
            ) : <><SkeletonCard /><SkeletonCard /></>}
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <MaterialIcons name="wifi-off" size={28} color="#b42318" />
            <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadSection()}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : section === 'my-profile' && profile ? (
          <View style={styles.profileContent}>
            <View style={styles.profileIdentity}>
              <View style={styles.profileAvatar}>
                {profileImage && !imageFailed ? (
                  <Image
                    accessibilityLabel={`${fullName} profile photo`}
                    source={{ uri: profileImage, headers: imageHeaders }}
                    style={styles.avatarImage}
                    onError={() => setImageFailed(true)}
                  />
                ) : <Text style={styles.avatarInitial}>{fullName.charAt(0).toUpperCase()}</Text>}
              </View>
              <Text style={styles.profileName}>{fullName}</Text>
              {profile.title ? <Text style={styles.mutedText}>{profile.title}</Text> : null}
            </View>
            <View style={styles.recordCard}>
              <Text style={styles.recordTitle}>Basic Information</Text>
              <InfoRow label="First name" value={profile.first_name} />
              <InfoRow label="Last name" value={profile.last_name} />
              <InfoRow label="Email" value={profile.email} />
              <InfoRow
                label="Phone number"
                value={profile.phone ? formatPhoneNumber(profile.phone) : profile.phone}
              />
              <InfoRow label="Address" value={address} />
              <Text style={styles.adminNote}>
                Name, email, and phone can only be changed by an administrator. Update photo, address, password, employment records, and notifications in Settings.
              </Text>
              <Pressable
                accessibilityRole="button"
                style={styles.settingsLink}
                onPress={() => router.push('/(tabs)/profile/account-settings')}>
                <Text style={styles.linkText}>Open Settings</Text>
                <MaterialIcons name="chevron-right" size={18} color={FORM_PRIMARY} />
              </Pressable>
            </View>
            <View style={styles.completedSection}>
              <View style={styles.recordHeading}>
                <Text style={styles.recordTitle}>Completed Shifts</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/(tabs)/profile/details', params: { section: 'timesheets' } })}>
                  <Text style={styles.linkText}>See all</Text>
                </Pressable>
              </View>
              {completedShifts.length ? (
                <View style={styles.completedList}>
                  {completedShifts.map((shift, index) => (
                    <View key={String(shift.id ?? index)} style={styles.completedShiftCard}>
                      <View style={styles.completedShiftTop}>
                        <View style={styles.facilityIcon}>
                          <MaterialIcons name="task-alt" size={20} color={FORM_PRIMARY} />
                        </View>
                        <View style={styles.completedShiftCopy}>
                          <Text style={styles.completedFacility} numberOfLines={1}>
                            {displayValue(shift.facility) || 'Facility'}
                          </Text>
                          <Text style={styles.mutedText} numberOfLines={1}>
                            {displayValue(shift.position) || 'Completed shift'}
                          </Text>
                        </View>
                        <Text style={styles.completedPay}>{formatMoney(displayValue(shift.pay))}</Text>
                      </View>
                      <View style={styles.completedMeta}>
                        <View style={styles.metaChip}>
                          <MaterialIcons name="event" size={15} color="#667085" />
                          <Text style={styles.metaText}>
                            {formatWorkDate(displayValue(shift.date) || displayValue(shift.start_date))}
                          </Text>
                        </View>
                        <View style={styles.metaChip}>
                          <MaterialIcons name="schedule" size={15} color="#667085" />
                          <Text style={styles.metaText}>{formatShiftTiming(displayValue(shift.timing))}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.mutedText}>No completed shifts yet.</Text>
              )}
            </View>
          </View>
        ) : section === 'settings' ? (
          <View style={styles.menuCard}>
            {[
              { tab: 'profile', title: 'Profile', icon: 'person-outline' as const },
              { tab: 'address', title: 'Address', icon: 'place' as const },
              { tab: 'employment', title: 'Employment', icon: 'work-outline' as const },
              { tab: 'notifications', title: 'Notifications', icon: 'notifications-none' as const },
            ].map((item, index) => (
              <View key={item.tab}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  accessibilityRole="button"
                  style={styles.menuItem}
                  onPress={() => router.push({
                    pathname: '/(tabs)/profile/account-settings',
                    params: { tab: item.tab },
                  })}>
                  <MaterialIcons name={item.icon} size={22} color={FORM_PRIMARY} />
                  <Text style={styles.menuLabel}>{item.title}</Text>
                  <MaterialIcons name="chevron-right" size={22} color="#98a2b3" />
                </Pressable>
              </View>
            ))}
            {settingsSections.map((item) => (
              <View key={item.section}>
                <View style={styles.divider} />
                <Pressable
                  accessibilityRole="button"
                  style={styles.menuItem}
                  onPress={() => {
                    if (item.section === 'references') {
                      router.push({ pathname: '/(tabs)/profile/details', params: { section: 'references' } });
                      return;
                    }
                    router.push({
                      pathname: '/(tabs)/profile/account-settings',
                      params: { tab: 'employment', section: item.section },
                    });
                  }}>
                  <MaterialIcons name={item.icon} size={22} color={FORM_PRIMARY} />
                  <Text style={styles.menuLabel}>{item.title}</Text>
                  <MaterialIcons name="chevron-right" size={22} color="#98a2b3" />
                </Pressable>
              </View>
            ))}
          </View>
        ) : section === 'timesheets' && records.length ? (
          <>
            <View style={styles.metricsRow}>
              <View style={[styles.metricCard, styles.metricPrimary]}>
                <Text style={styles.metricLabelLight}>Shifts</Text>
                <Text style={styles.metricValueLight}>{records.length}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Hours</Text>
                <Text style={styles.metricValue}>{totalHours.toFixed(1)}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Pay</Text>
                <Text style={styles.metricValue}>{formatMoney(earningsTotal)}</Text>
              </View>
            </View>
            <View style={styles.recordList}>
              {records.map((record, index) => (
                <View key={String(record.id ?? index)} style={styles.timesheetCard}>
                  <View style={styles.timesheetTop}>
                    <View style={styles.facilityIcon}>
                      <MaterialIcons name="local-hospital" size={20} color={FORM_PRIMARY} />
                    </View>
                    <View style={styles.timesheetHeading}>
                      <Text style={styles.recordTitle} numberOfLines={2}>
                        {displayValue(record.facility) || 'Facility'}
                      </Text>
                      <Text style={styles.mutedText}>{displayValue(record.position) || 'Position'}</Text>
                    </View>
                    <Text style={styles.rate}>{formatMoney(displayValue(record.pay))}</Text>
                  </View>
                  <View style={styles.timesheetMeta}>
                    <View style={styles.metaChip}>
                      <MaterialIcons name="event" size={15} color="#667085" />
                      <Text style={styles.metaText}>{formatWorkDate(displayValue(record.date))}</Text>
                    </View>
                    <View style={styles.metaChip}>
                      <MaterialIcons name="schedule" size={15} color="#667085" />
                      <Text style={styles.metaText}>{formatShiftTiming(displayValue(record.timing))}</Text>
                    </View>
                    <View style={styles.metaChip}>
                      <MaterialIcons name="timelapse" size={15} color="#667085" />
                      <Text style={styles.metaText}>{displayValue(record.total_hours) || '—'}</Text>
                    </View>
                  </View>
                  <View style={styles.punchRow}>
                    <Text style={styles.punchText}>In {displayValue(record.punch_in) || '—'}</Text>
                    <MaterialIcons name="arrow-forward" size={16} color="#98a2b3" />
                    <Text style={styles.punchText}>Out {displayValue(record.punch_out) || '—'}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : section === 'earnings' && (records.length || earningsMonths.some((month) => month.pay > 0)) ? (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryEyebrow}>{new Date().getFullYear()} year to date</Text>
              <Text style={styles.totalAmount}>{formatMoney(earningsYearTotal || earningsTotal)}</Text>
              <Text style={styles.mutedText}>
                {records.length} recent shifts · {totalHours.toFixed(1)} hours loaded
              </Text>
            </View>
            <View style={styles.chartCard}>
              <Text style={styles.recordTitle}>Monthly earnings</Text>
              <Text style={styles.mutedText}>Paid hours across the year</Text>
              <EarningsChart months={earningsMonths} />
            </View>
            <View style={styles.recordList}>
              {records.map((record, index) => (
                <View key={String(record.id ?? index)} style={styles.timesheetCard}>
                  <View style={styles.timesheetTop}>
                    <View style={styles.facilityIcon}>
                      <MaterialIcons name="payments" size={20} color={FORM_PRIMARY} />
                    </View>
                    <View style={styles.timesheetHeading}>
                      <Text style={styles.recordTitle} numberOfLines={2}>
                        {displayValue(record.facility) || 'Facility'}
                      </Text>
                      <Text style={styles.mutedText}>
                        {[formatWorkDate(displayValue(record.date)), displayValue(record.total_hours)]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <Text style={styles.rate}>{formatMoney(displayValue(record.pay))}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : records.length ? (
          <View style={styles.recordList}>
            {records.map((record, index) => (
              <View key={String(record.id ?? index)} style={styles.recordCard}>
                {visibleRecords[index]?.map((item) => (
                  <InfoRow
                    key={item.key}
                    label={item.label}
                    value={item.key === 'date'
                      ? formatWorkDate(item.value)
                      : item.key === 'timing'
                        ? formatShiftTiming(item.value)
                        : item.key === 'pay'
                          ? formatMoney(item.value)
                          : item.key === 'phone' || item.key === 'telephone'
                            ? displayValue(item.value, item.key)
                            : item.value}
                  />
                ))}
              </View>
            ))}
          </View>
        ) : section === 'timesheets' || section === 'earnings' || section === 'references' ? (
          <EmptyState text={section === 'timesheets' ? 'No time sheets are available.' : `No ${title.toLowerCase()} records found.`} />
        ) : null}

        {hasMore && !loading && !error ? (
          <Pressable
            accessibilityRole="button"
            style={styles.loadMoreButton}
            disabled={loadingMore}
            onPress={() => void loadSection(page.current + 1)}>
            {loadingMore
              ? <ActivityIndicator color={FORM_PRIMARY} />
              : <Text style={styles.loadMoreText}>Load More</Text>}
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.stateCard}>
      <MaterialIcons name="inbox" size={30} color="#98a2b3" />
      <Text style={styles.mutedText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  softSafeArea: { backgroundColor: '#f7f9fc' },
  container: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 18, gap: 16 },
  skeletonList: { gap: 12 },
  skeletonCard: { padding: 16, gap: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e7edf3', backgroundColor: '#fff' },
  skeletonAvatar: { width: 74, height: 74, borderRadius: 37 },
  skeletonDetails: { flex: 1, gap: 10 },
  profileSkeleton: { flexDirection: 'row', alignItems: 'center', gap: 15, padding: 16, borderRadius: 12, backgroundColor: '#f5f8fb' },
  profileContent: { gap: 16 },
  profileIdentity: { alignItems: 'center', gap: 7, padding: 18 },
  profileAvatar: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 40, backgroundColor: '#eaf3fb' },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { color: FORM_PRIMARY, fontSize: 28, fontWeight: '700' },
  profileName: { color: '#263341', fontSize: 19, fontWeight: '700' },
  recordCard: { gap: 12, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e7edf3', backgroundColor: '#fff' },
  recordList: { gap: 10 },
  recordHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  recordTitle: { color: '#263341', fontSize: 16, fontWeight: '700' },
  rate: { color: '#263341', fontSize: 15, fontWeight: '700' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 5 },
  infoLabel: { flex: 1, color: '#667085', fontSize: 13 },
  infoValue: { flex: 1, color: '#344054', fontSize: 14, fontWeight: '500', textAlign: 'right' },
  summaryCard: { padding: 16, gap: 7, borderRadius: 14, borderWidth: 1, borderColor: '#d8e8f5', backgroundColor: '#f3f8fc' },
  summaryEyebrow: { color: FORM_PRIMARY, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  chartCard: { gap: 8, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#e7edf3', backgroundColor: '#fff' },
  totalAmount: { color: '#263341', fontSize: 28, fontWeight: '700' },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, minHeight: 86, justifyContent: 'space-between', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e7edf3', backgroundColor: '#fff' },
  metricPrimary: { backgroundColor: FORM_PRIMARY, borderColor: FORM_PRIMARY },
  metricLabel: { color: '#667085', fontSize: 12, fontWeight: '600' },
  metricLabelLight: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  metricValue: { color: '#263341', fontSize: 18, fontWeight: '700' },
  metricValueLight: { color: '#fff', fontSize: 18, fontWeight: '700' },
  timesheetCard: { gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#e7edf3', backgroundColor: '#fff' },
  timesheetTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  facilityIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eaf3fb' },
  timesheetHeading: { flex: 1, gap: 2 },
  timesheetMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: '#f5f8fb' },
  metaText: { color: '#475467', fontSize: 12, fontWeight: '500' },
  punchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 },
  punchText: { color: '#344054', fontSize: 13, fontWeight: '600' },
  mutedText: { color: '#667085', fontSize: 13 },
  stateCard: { minHeight: 160, alignItems: 'center', justifyContent: 'center', padding: 22, gap: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e7edf3' },
  errorText: { color: '#b42318', fontSize: 14, textAlign: 'center' },
  retryText: { color: FORM_PRIMARY, fontSize: 14, fontWeight: '700', padding: 6 },
  menuCard: { paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e7edf3' },
  menuItem: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuLabel: { flex: 1, color: '#344054', fontSize: 15, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e4e7ec' },
  recordText: { flex: 1, gap: 3 },
  completedSection: { gap: 12 },
  completedList: { gap: 10 },
  completedShiftCard: {
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e7edf3',
    backgroundColor: '#fff',
  },
  completedShiftTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  completedShiftCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  completedFacility: {
    color: '#263341',
    fontSize: 15,
    fontWeight: '700',
  },
  completedPay: {
    color: '#263341',
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 0,
  },
  completedMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  linkText: { color: FORM_PRIMARY, fontSize: 13, fontWeight: '700' },
  adminNote: { color: '#667085', fontSize: 12, lineHeight: 17, marginTop: 4 },
  settingsLink: {
    marginTop: 8,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  loadMoreButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: FORM_PRIMARY },
  loadMoreText: { color: FORM_PRIMARY, fontSize: 15, fontWeight: '700' },
});
