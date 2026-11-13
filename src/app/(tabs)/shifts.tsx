import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ElementRef } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { applyForWork, fetchWorkPage, formatMoney, formatShiftTiming, formatWorkDate, getShiftPayRate, type WorkItem } from '@/api/work';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';
import { Skeleton, SkeletonLines } from '@/components/ui/Skeleton';
import { SuccessTickModal } from '@/components/ui/SuccessTickModal';
import {
  getWorkListCache,
  invalidateWorkListCache,
  removeWorkItemFromCache,
  setWorkListCache,
} from '@/store/workListCache';
import {
  isMutationConflictError,
  mutationConflictMessage,
  shouldDropStaleWorkItem,
} from '@/utils/mutationConflict';

type ShiftTab = 'available' | 'completed';

function ShiftSkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Skeleton style={styles.skeletonIcon} />
        <View style={styles.cardHeading}>
          <Skeleton style={{ width: '72%', height: 16 }} />
          <Skeleton style={{ width: '48%', height: 13 }} />
        </View>
      </View>
      <SkeletonLines count={2} />
      <View style={styles.cardBottom}>
        <Skeleton style={{ width: 72, height: 18 }} />
        <Skeleton style={{ width: 76, height: 38, borderRadius: 9 }} />
      </View>
    </View>
  );
}

function DistanceSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(1);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) =>
          onChange(Math.max(0, Math.min(100, Math.round((event.nativeEvent.locationX / trackWidth) * 100)))),
        onPanResponderMove: (event) =>
          onChange(Math.max(0, Math.min(100, Math.round((event.nativeEvent.locationX / trackWidth) * 100)))),
      }),
    [onChange, trackWidth],
  );

  return (
    <View style={styles.distancePanel}>
      <View style={styles.distanceHeading}>
        <Text style={styles.distanceTitle}>Distance</Text>
        <Text style={styles.distanceValue}>{value} miles</Text>
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Maximum distance in miles"
        accessibilityValue={{ min: 0, max: 100, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) =>
          onChange(Math.max(0, Math.min(100, value + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))
        }
        onLayout={(event) => {
          setTrackWidth(event.nativeEvent.layout.width);
        }}
        {...panResponder.panHandlers}
        style={styles.sliderTrack}>
        <View style={styles.sliderBase} />
        <View style={[styles.sliderFill, { width: `${value}%` }]} />
        <View style={[styles.sliderThumb, { left: `${value}%` }]} />
      </View>
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabel}>0 mi</Text>
        <Text style={styles.sliderLabel}>100 mi</Text>
      </View>
    </View>
  );
}

export default function ShiftsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<ShiftTab>('available');
  const [distance, setDistance] = useState(0);
  const [available, setAvailable] = useState<WorkItem[]>([]);
  const [completed, setCompleted] = useState<WorkItem[]>([]);
  const [availableLoading, setAvailableLoading] = useState(true);
  const [completedLoading, setCompletedLoading] = useState(true);
  const [availableMoreLoading, setAvailableMoreLoading] = useState(false);
  const [completedMoreLoading, setCompletedMoreLoading] = useState(false);
  const [availableError, setAvailableError] = useState<string | null>(null);
  const [completedError, setCompletedError] = useState<string | null>(null);
  const [availableHasMore, setAvailableHasMore] = useState(false);
  const [completedHasMore, setCompletedHasMore] = useState(false);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [pendingShift, setPendingShift] = useState<WorkItem | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [successVisible, setSuccessVisible] = useState(false);
  const availablePage = useRef(1);
  const completedPage = useRef(1);
  const availableRequest = useRef(0);
  const completedRequest = useRef(0);
  const availableTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const availableMoreBusy = useRef(false);
  const completedMoreBusy = useRef(false);
  const applyBusy = useRef(false);

  const loadAvailable = useCallback((options?: { force?: boolean; clear?: boolean }) => {
    if (availableTimer.current) clearTimeout(availableTimer.current);
    const requestId = ++availableRequest.current;
    const cached = getWorkListCache('per_diem');
    const cacheMatchesRange = cached && cached.data.range === distance;

    if (cacheMatchesRange && !options?.clear) {
      setAvailable(cached.data.results);
      setAvailableHasMore(cached.data.hasMore);
      availablePage.current = cached.data.page;
      setAvailableLoading(false);
    } else if (options?.clear || !cacheMatchesRange) {
      setAvailable([]);
      setAvailableHasMore(false);
      availablePage.current = 1;
      setAvailableLoading(true);
    } else {
      setAvailableLoading(true);
    }

    setAvailableError(null);
    setAvailableMoreLoading(false);
    availableTimer.current = setTimeout(() => {
      void fetchWorkPage<WorkItem>('/per_diem_jobs/', 1, distance)
        .then((page) => {
          if (requestId !== availableRequest.current) return;
          setAvailable(page.results);
          setAvailableHasMore(page.hasMore);
          availablePage.current = 1;
          setWorkListCache('per_diem', {
            results: page.results,
            hasMore: page.hasMore,
            range: distance,
            page: 1,
          });
        })
        .catch((loadError: unknown) => {
          if (requestId === availableRequest.current && !cacheMatchesRange) {
            setAvailableError(loadError instanceof Error ? loadError.message : 'Unable to load available shifts.');
          }
        })
        .finally(() => {
          if (requestId === availableRequest.current) setAvailableLoading(false);
        });
    }, options?.force ? 0 : 250);
  }, [distance]);

  useFocusEffect(useCallback(() => {
    loadAvailable();
    return () => {
      availableRequest.current += 1;
      if (availableTimer.current) clearTimeout(availableTimer.current);
    };
  }, [loadAvailable]));

  const loadCompleted = useCallback((options?: { force?: boolean }) => {
    const requestId = ++completedRequest.current;
    const cached = getWorkListCache('completed');
    if (cached && !options?.force) {
      setCompleted(cached.data.results);
      setCompletedHasMore(cached.data.hasMore);
      completedPage.current = cached.data.page;
      setCompletedLoading(false);
    } else {
      setCompletedLoading(true);
      if (!cached) {
        setCompleted([]);
        setCompletedHasMore(false);
        completedPage.current = 1;
      }
    }
    setCompletedError(null);
    setCompletedMoreLoading(false);
    void fetchWorkPage<WorkItem>('/shifts/completed_shifts/', 1)
      .then((page) => {
        if (requestId !== completedRequest.current) return;
        setCompleted(page.results);
        setCompletedHasMore(page.hasMore);
        completedPage.current = 1;
        setWorkListCache('completed', {
          results: page.results,
          hasMore: page.hasMore,
          page: 1,
        });
      })
      .catch((loadError: unknown) => {
        if (requestId === completedRequest.current && !cached) {
          setCompletedError(loadError instanceof Error ? loadError.message : 'Unable to load completed shifts.');
        }
      })
      .finally(() => {
        if (requestId === completedRequest.current) setCompletedLoading(false);
      });
  }, []);

  useFocusEffect(useCallback(() => {
    loadCompleted();
    return () => {
      completedRequest.current += 1;
    };
  }, [loadCompleted]));

  const loadMore = async (type: ShiftTab) => {
    const isAvailable = type === 'available';
    const busy = isAvailable ? availableMoreBusy : completedMoreBusy;
    if (busy.current) return;
    busy.current = true;
    const requestId = isAvailable ? availableRequest.current : completedRequest.current;
    if (isAvailable) setAvailableMoreLoading(true);
    else setCompletedMoreLoading(true);
    if (isAvailable) setAvailableError(null);
    else setCompletedError(null);

    const nextPage = (isAvailable ? availablePage.current : completedPage.current) + 1;
    try {
      const page = await fetchWorkPage<WorkItem>(
        isAvailable ? '/per_diem_jobs/' : '/shifts/completed_shifts/',
        nextPage,
        isAvailable ? distance : undefined,
      );
      if (requestId !== (isAvailable ? availableRequest.current : completedRequest.current)) return;
      if (isAvailable) {
        setAvailable((current) => {
          const merged = [...current, ...page.results];
          setWorkListCache('per_diem', {
            results: merged,
            hasMore: page.hasMore,
            range: distance,
            page: nextPage,
          });
          return merged;
        });
        availablePage.current = nextPage;
        setAvailableHasMore(page.hasMore);
      } else {
        setCompleted((current) => {
          const merged = [...current, ...page.results];
          setWorkListCache('completed', {
            results: merged,
            hasMore: page.hasMore,
            page: nextPage,
          });
          return merged;
        });
        completedPage.current = nextPage;
        setCompletedHasMore(page.hasMore);
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load more shifts.';
      if (requestId === (isAvailable ? availableRequest.current : completedRequest.current)) {
        if (isAvailable) setAvailableError(message);
        else setCompletedError(message);
      }
    } finally {
      busy.current = false;
      if (requestId === (isAvailable ? availableRequest.current : completedRequest.current)) {
        if (isAvailable) setAvailableMoreLoading(false);
        else setCompletedMoreLoading(false);
      }
    }
  };

  const openDetails = (shift: WorkItem) => {
    router.push({
      pathname: '/(tabs)/shift-details',
      params: {
        id: String(shift.id),
        facility: shift.facility ?? 'Facility',
        date: shift.start_date ?? '',
        timing: formatShiftTiming(shift.timing),
        price: formatMoney(getShiftPayRate(shift)),
      },
    });
  };

  const requestPickShift = (shift: WorkItem) => {
    if (applyBusy.current) return;
    setPickError(null);
    setPendingShift(shift);
  };

  const confirmPickShift = () => {
    if (!pendingShift || applyBusy.current) return;
    const shift = pendingShift;
    setPendingShift(null);
    applyBusy.current = true;
    setApplyingId(shift.id);
    void applyForWork('/per_diem_job_applications/', shift.id)
      .then(() => {
        removeWorkItemFromCache('per_diem', shift.id);
        setAvailable((current) => current.filter((item) => item.id !== shift.id));
        invalidateWorkListCache('shift_counts');
        setSuccessVisible(true);
      })
      .catch((error: unknown) => {
        const message = mutationConflictMessage(
          error,
          'Your application could not be submitted. Please try again.',
        );
        setPickError(message);
        if (shouldDropStaleWorkItem(error) || isMutationConflictError(error)) {
          if (shouldDropStaleWorkItem(error)) {
            removeWorkItemFromCache('per_diem', shift.id);
            setAvailable((current) => current.filter((item) => item.id !== shift.id));
          }
          void loadAvailable({ force: true });
        }
      })
      .finally(() => {
        applyBusy.current = false;
        setApplyingId(null);
      });
  };

  const pagerRef = useRef<ElementRef<typeof ScrollView>>(null);
  const [pageWidth, setPageWidth] = useState(0);

  const goToTab = (next: ShiftTab, animated = true) => {
    setTab(next);
    if (pageWidth <= 0) return;
    pagerRef.current?.scrollTo({
      x: (next === 'available' ? 0 : 1) * pageWidth,
      animated,
    });
  };

  const renderTabBody = (type: ShiftTab) => {
    const shifts = type === 'available' ? available : completed;
    const loading = type === 'available' ? availableLoading : completedLoading;
    const error = type === 'available' ? availableError : completedError;
    const hasMore = type === 'available' ? availableHasMore : completedHasMore;
    const moreLoading = type === 'available' ? availableMoreLoading : completedMoreLoading;

    return (
      <View style={[styles.page, pageWidth > 0 && { width: pageWidth }]}>
        {type === 'available' ? <DistanceSlider value={distance} onChange={setDistance} /> : null}
        {error && shifts.length === 0 ? (
          <View style={styles.statusPanel}>
            <MaterialIcons name="wifi-off" size={26} color="#b42318" />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (type === 'available') loadAvailable({ force: true });
                else loadCompleted({ force: true });
              }}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : loading && shifts.length === 0 ? (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            <ShiftSkeletonCard />
            <ShiftSkeletonCard />
            <ShiftSkeletonCard />
          </ScrollView>
        ) : shifts.length === 0 ? (
          <View style={styles.statusPanel}>
            <MaterialIcons name="event-busy" size={34} color="#98a2b3" />
            <Text style={styles.emptyTitle}>
              {type === 'available' ? 'No shifts available nearby' : 'No completed shifts yet'}
            </Text>
            <Text style={styles.mutedText}>
              {type === 'available'
                ? 'Try increasing your distance to see more opportunities.'
                : 'Completed shifts will appear here.'}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {error ? (
              <View style={styles.inlineError}>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable accessibilityRole="button" onPress={() => void loadMore(type)}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : null}
            {shifts.map((shift) => (
              type === 'available' ? (
                <Pressable key={shift.id} style={styles.card} onPress={() => openDetails(shift)}>
                  <View style={styles.cardTop}>
                    <View style={styles.facilityIcon}>
                      <MaterialIcons name="local-hospital" size={21} color={FORM_PRIMARY} />
                    </View>
                    <View style={styles.cardHeading}>
                      <Text style={styles.facilityName}>{shift.facility || 'Facility'}</Text>
                      <Text style={styles.position}>{typeof shift.profession === 'string' ? shift.profession : shift.profession?.name || 'Per diem shift'}</Text>
                    </View>
                  </View>
                  <View style={styles.detailsRow}>
                    <Detail icon="event" value={formatWorkDate(shift.start_date)} />
                    <Detail icon="schedule" value={formatShiftTiming(shift.timing)} />
                  </View>
                  <View style={styles.cardBottom}>
                    <Text style={styles.pay}>{formatMoney(getShiftPayRate(shift))}</Text>
                    <Pressable
                      accessibilityRole="button"
                      style={[styles.actionButton, applyingId === shift.id && styles.disabled]}
                      disabled={applyingId !== null}
                      onPress={(event) => {
                        event.stopPropagation();
                        requestPickShift(shift);
                      }}>
                      {applyingId === shift.id
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.actionButtonText}>Pick</Text>}
                    </Pressable>
                  </View>
                </Pressable>
              ) : (
                <View key={shift.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.facilityIcon}>
                      <MaterialIcons name="task-alt" size={21} color={FORM_PRIMARY} />
                    </View>
                    <View style={styles.cardHeading}>
                      <Text style={styles.facilityName}>{shift.facility || 'Facility'}</Text>
                    </View>
                  </View>
                  <View style={styles.detailsRow}>
                    <Detail icon="event" value={formatWorkDate(shift.date)} />
                    <Detail icon="schedule" value={formatShiftTiming(shift.timing)} />
                  </View>
                  <View style={styles.cardBottom}>
                    <Text style={styles.pay}>{formatMoney(shift.pay)}</Text>
                  </View>
                </View>
              )
            ))}
            {hasMore ? (
              <Pressable
                accessibilityRole="button"
                style={[styles.loadMore, moreLoading && styles.disabled]}
                onPress={() => void loadMore(type)}
                disabled={moreLoading}>
                {moreLoading
                  ? <ActivityIndicator color={FORM_PRIMARY} />
                  : <Text style={styles.loadMoreText}>Load More</Text>}
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.tabs}>
          {([
            ['available', 'Per Diem Shifts'],
            ['completed', 'Completed Shifts'],
          ] as const).map(([id, label]) => (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === id }}
              onPress={() => goToTab(id)}
              style={[styles.tab, tab === id && styles.activeTab]}>
              <Text style={[styles.tabText, tab === id && styles.activeTabText]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View
          style={styles.pager}
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            if (width > 0 && width !== pageWidth) {
              setPageWidth(width);
              requestAnimationFrame(() => {
                pagerRef.current?.scrollTo({
                  x: (tab === 'available' ? 0 : 1) * width,
                  animated: false,
                });
              });
            }
          }}>
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            bounces={false}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.pager}
            onMomentumScrollEnd={(event) => {
              if (pageWidth <= 0) return;
              const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
              setTab(index === 0 ? 'available' : 'completed');
            }}>
            {renderTabBody('available')}
            {renderTabBody('completed')}
          </ScrollView>
        </View>
      </View>
      <ConfirmModal
        visible={pendingShift != null}
        title="Pick this shift?"
        message={`Apply to the shift at ${pendingShift?.facility ?? 'this facility'}?`}
        confirmLabel="Pick"
        destructive={false}
        busy={applyingId !== null}
        onCancel={() => {
          if (applyingId === null) setPendingShift(null);
        }}
        onConfirm={confirmPickShift}
      />
      <ConfirmModal
        visible={pickError != null}
        title="Unable to apply"
        message={pickError || ''}
        confirmLabel="OK"
        cancelLabel="Close"
        destructive={false}
        onCancel={() => setPickError(null)}
        onConfirm={() => setPickError(null)}
      />
      <SuccessTickModal
        visible={successVisible}
        onDone={() => {
          setSuccessVisible(false);
          router.replace('/(tabs)/home');
        }}
      />
    </SafeAreaView>
  );
}

function Detail({ icon, value }: { icon: 'event' | 'schedule'; value: string }) {
  return (
    <View style={styles.detail}>
      <MaterialIcons name={icon} size={17} color="#667085" />
      <Text style={styles.detailText}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f9fc' },
  container: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12 },
  pager: { flex: 1 },
  page: { flex: 1 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e4e7ec' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: FORM_PRIMARY },
  tabText: { color: '#667085', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  activeTabText: { color: FORM_PRIMARY },
  distancePanel: { paddingVertical: 16, paddingHorizontal: 4, gap: 8 },
  distanceHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  distanceTitle: { color: '#344054', fontSize: 15, fontWeight: '700' },
  distanceValue: { color: FORM_PRIMARY, fontSize: 14, fontWeight: '700' },
  sliderTrack: { height: 30, justifyContent: 'center' },
  sliderBase: { position: 'absolute', left: 0, right: 0, top: 12, height: 5, borderRadius: 3, backgroundColor: '#d0d5dd' },
  sliderFill: { position: 'absolute', left: 0, top: 12, height: 5, borderRadius: 3, backgroundColor: FORM_PRIMARY },
  sliderThumb: { position: 'absolute', width: 20, height: 20, marginLeft: -10, borderRadius: 10, borderWidth: 3, borderColor: FORM_PRIMARY, backgroundColor: '#fff', elevation: 2 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderLabel: { color: '#667085', fontSize: 12 },
  list: { paddingTop: 4, paddingBottom: 24, gap: 12 },
  card: { padding: 16, gap: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7edf3', elevation: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  facilityIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#eaf3fb' },
  skeletonIcon: { width: 42, height: 42, borderRadius: 12 },
  cardHeading: { flex: 1, gap: 3 },
  facilityName: { color: '#263341', fontSize: 16, fontWeight: '700' },
  position: { color: '#667085', fontSize: 13 },
  detailsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { color: '#475467', fontSize: 13 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f0f2f5', paddingTop: 12 },
  pay: { color: '#263341', fontSize: 17, fontWeight: '700' },
  actionButton: { minWidth: 76, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: FORM_PRIMARY, paddingHorizontal: 16 },
  actionButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  loadMore: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FORM_PRIMARY, borderRadius: 10, backgroundColor: '#fff' },
  loadMoreText: { color: FORM_PRIMARY, fontSize: 14, fontWeight: '700' },
  statusPanel: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  emptyTitle: { color: '#344054', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  mutedText: { color: '#667085', fontSize: 14, textAlign: 'center' },
  errorText: { color: '#b42318', fontSize: 14, textAlign: 'center' },
  inlineError: { alignItems: 'center', padding: 10, borderRadius: 8, backgroundColor: '#fef3f2' },
  retryText: { color: FORM_PRIMARY, fontSize: 14, fontWeight: '700', padding: 8 },
  disabled: { opacity: 0.6 },
});
