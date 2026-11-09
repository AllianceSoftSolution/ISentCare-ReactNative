import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  dropShiftApplication,
  fetchMyShiftApplications,
  professionName,
  type MyShiftApplication,
} from '@/api/myShifts';
import { formatMoney, formatShiftTiming, formatWorkDate } from '@/api/work';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';
import { ScreenHeader, ScreenHeaderRefresh } from '@/components/ui/ScreenHeader';
import { Skeleton, SkeletonLines } from '@/components/ui/Skeleton';

export default function MyShiftsScreen() {
  const router = useRouter();
  const [shifts, setShifts] = useState<MyShiftApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [droppingId, setDroppingId] = useState<number | null>(null);
  const page = useRef(1);
  const busy = useRef(false);
  const requestId = useRef(0);

  const load = useCallback(async (nextPage = 1) => {
    if (busy.current) return;
    busy.current = true;
    const active = ++requestId.current;
    if (nextPage === 1) {
      setLoading(true);
      setError(null);
      setHasMore(false);
      page.current = 1;
    } else {
      setLoadingMore(true);
    }
    try {
      const result = await fetchMyShiftApplications(nextPage);
      if (active !== requestId.current) return;
      setShifts((current) => (nextPage === 1 ? result.results : [...current, ...result.results]));
      setHasMore(result.hasMore);
      page.current = nextPage;
    } catch (loadError) {
      if (active === requestId.current) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load your shifts.');
      }
    } finally {
      if (active === requestId.current) {
        busy.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

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

  const onDrop = (shift: MyShiftApplication) => {
    Alert.alert('Drop this shift?', 'Are you sure you want to drop this shift request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Drop',
        style: 'destructive',
        onPress: () => {
          setDroppingId(shift.id);
          void dropShiftApplication(shift.id)
            .then(() => {
              setShifts((current) => current.filter((item) => item.id !== shift.id));
              Alert.alert('Shift dropped', 'The shift was dropped successfully.');
            })
            .catch((dropError: unknown) => {
              Alert.alert(
                'Unable to drop shift',
                dropError instanceof Error
                  ? dropError.message
                  : 'This shift could not be dropped. Please try again.',
              );
            })
            .finally(() => setDroppingId(null));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <ScreenHeader
        title="My Shifts"
        onBack={() => router.back()}
        right={<ScreenHeaderRefresh onPress={() => void load()} disabled={loading} />}
      />

      {loading ? (
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : error ? (
        <View style={styles.stateCard}>
          <MaterialIcons name="wifi-off" size={28} color="#b42318" />
          <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {!shifts.length ? (
            <View style={styles.stateCard}>
              <MaterialIcons name="event-busy" size={30} color="#98a2b3" />
              <Text style={styles.mutedText}>No shifts found.</Text>
            </View>
          ) : (
            shifts.map((shift) => {
              const job = shift.job;
              const canDrop = String(shift.status || '').toLowerCase() === 'approved';
              return (
                <View key={shift.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.profession}>{professionName(job)}</Text>
                    {shift.status ? (
                      <Text style={[styles.status, canDrop ? styles.statusApproved : null]}>
                        {shift.status}
                      </Text>
                    ) : null}
                  </View>
                  <DetailRow icon="local-hospital" value={job?.facility || 'Facility'} />
                  <DetailRow icon="location-on" value={job?.state || 'State unavailable'} />
                  <View style={styles.metaRow}>
                    <DetailChip icon="event" value={formatWorkDate(job?.start_date)} />
                    <DetailChip icon="schedule" value={formatShiftTiming(job?.timing)} />
                    <DetailChip icon="payments" value={formatMoney(job?.bill_rate)} />
                  </View>
                  {canDrop ? (
                    <Pressable
                      accessibilityRole="button"
                      style={[styles.dropButton, droppingId === shift.id && styles.disabled]}
                      disabled={droppingId === shift.id}
                      onPress={() => onDrop(shift)}>
                      {droppingId === shift.id ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.dropButtonText}>Drop</Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )}

          {hasMore ? (
            <Pressable
              accessibilityRole="button"
              style={[styles.loadMore, loadingMore && styles.disabled]}
              disabled={loadingMore}
              onPress={() => void load(page.current + 1)}>
              {loadingMore ? (
                <ActivityIndicator color={FORM_PRIMARY} />
              ) : (
                <Text style={styles.loadMoreText}>Load More</Text>
              )}
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function DetailRow({ icon, value }: { icon: 'local-hospital' | 'location-on'; value: string }) {
  return (
    <View style={styles.detailRow}>
      <MaterialIcons name={icon} size={18} color={FORM_PRIMARY} />
      <Text style={styles.detailText}>{value}</Text>
    </View>
  );
}

function DetailChip({
  icon,
  value,
}: {
  icon: 'event' | 'schedule' | 'payments';
  value: string;
}) {
  return (
    <View style={styles.chip}>
      <MaterialIcons name={icon} size={16} color="#667085" />
      <Text style={styles.chipText}>{value}</Text>
    </View>
  );
}

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <Skeleton style={{ width: '55%', height: 18 }} />
      <SkeletonLines count={3} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  list: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, gap: 12 },
  card: {
    gap: 10,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7edf3',
    backgroundColor: '#fff',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  profession: { flex: 1, color: '#263341', fontSize: 16, fontWeight: '800' },
  status: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#f2f4f7',
    overflow: 'hidden',
  },
  statusApproved: { color: '#067647', backgroundColor: '#ecfdf3' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { flex: 1, color: '#344054', fontSize: 14 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f5f8fb',
  },
  chipText: { color: '#475467', fontSize: 12, fontWeight: '600' },
  dropButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: FORM_PRIMARY,
    marginTop: 4,
  },
  dropButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  loadMore: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: FORM_PRIMARY,
  },
  loadMoreText: { color: FORM_PRIMARY, fontSize: 15, fontWeight: '700' },
  stateCard: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7edf3',
    margin: 16,
  },
  mutedText: { color: '#667085', fontSize: 14 },
  errorText: { color: '#b42318', fontSize: 14, textAlign: 'center' },
  retryText: { color: FORM_PRIMARY, fontSize: 14, fontWeight: '700', padding: 6 },
  disabled: { opacity: 0.65 },
});
