import {
  fetchTodayShifts,
  isBreakDeductionEligible,
  punchIn,
  punchOut,
  type TodayShift,
} from '@/api/shifts';
import { fetchWorkCount, formatMoney, formatShiftTiming, formatWorkDate } from '@/api/work';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';
import { Skeleton, SkeletonLines } from '@/components/ui/Skeleton';
import {
  getWorkListCache,
  invalidateWorkListCache,
  removeWorkItemFromCache,
  setWorkListCache,
} from '@/store/workListCache';
import {
  mutationConflictMessage,
  shouldDropStaleWorkItem,
} from '@/utils/mutationConflict';
import { getFreshShiftLocation, ShiftLocationError } from '@/utils/shift-location';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ConfirmAction = {
  shift: TodayShift;
  mode: 'start' | 'end';
};

type BreakPrompt = {
  shift: TodayShift;
  latitude: number;
  longitude: number;
};

export default function HomeScreen() {
  const router = useRouter();
  const [shifts, setShifts] = useState<TodayShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyApplicationId, setBusyApplicationId] = useState<number | null>(null);
  const [shiftCounts, setShiftCounts] = useState<{ available: number; completed: number } | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ConfirmAction | null>(null);
  const [breakPrompt, setBreakPrompt] = useState<BreakPrompt | null>(null);
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
    canOpenSettings?: boolean;
  } | null>(null);
  const requestId = useRef(0);
  const actionBusy = useRef(false);
  const countsRequestId = useRef(0);
  /** Local punch-in timestamps by application id (fallback before todayShifts refresh). */
  const localPunchInAt = useRef<Record<number, number>>({});

  const loadShifts = useCallback(async (options?: { force?: boolean }) => {
    const currentRequest = ++requestId.current;
    const cached = getWorkListCache('today');
    if (cached && !options?.force) {
      setShifts(cached.data);
      setLoading(false);
    } else if (!cached) {
      setLoading(true);
    }
    setError(null);
    try {
      const results = await fetchTodayShifts();
      if (currentRequest !== requestId.current) return;
      setShifts(results);
      setWorkListCache('today', results);
    } catch (loadError) {
      if (currentRequest === requestId.current && !cached) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load today’s shifts.');
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  const loadCounts = useCallback(async (options?: { force?: boolean }) => {
    const currentRequest = ++countsRequestId.current;
    const cached = getWorkListCache('shift_counts');
    if (cached && !options?.force) {
      setShiftCounts(cached.data);
      setCountsLoading(false);
    } else if (!cached) {
      setCountsLoading(true);
    }
    setCountsError(null);
    try {
      const [available, completed] = await Promise.all([
        fetchWorkCount('/per_diem_jobs/'),
        fetchWorkCount('/shifts/completed_shifts/'),
      ]);
      if (currentRequest !== countsRequestId.current) return;
      const next = { available, completed };
      setShiftCounts(next);
      setWorkListCache('shift_counts', next);
    } catch (countError) {
      if (currentRequest === countsRequestId.current && !cached) {
        setCountsError(countError instanceof Error ? countError.message : 'Unable to load shift totals.');
      }
    } finally {
      if (currentRequest === countsRequestId.current) setCountsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadShifts();
      void loadCounts();
      return () => {
        requestId.current += 1;
        countsRequestId.current += 1;
      };
    }, [loadShifts, loadCounts]),
  );

  const finishPunchOut = async (
    prompt: BreakPrompt,
    tookBreak: boolean,
    options?: { alreadyBusy?: boolean },
  ) => {
    if (prompt.shift.shift === null) return;
    if (!options?.alreadyBusy) {
      if (actionBusy.current) return;
      actionBusy.current = true;
      setBusyApplicationId(prompt.shift.id);
    }
    setBreakPrompt(null);
    const breakEligible = isBreakDeductionEligible(
      prompt.shift,
      localPunchInAt.current[prompt.shift.id],
    );
    const applyBreak = tookBreak && breakEligible;
    try {
      await punchOut(
        prompt.shift.shift,
        { latitude: prompt.latitude, longitude: prompt.longitude },
        applyBreak,
      );
      delete localPunchInAt.current[prompt.shift.id];
      try {
        const results = await fetchTodayShifts();
        setShifts(results);
        setWorkListCache('today', results);
      } catch {
        // Punch-out succeeded; fall back to local removal if the refresh fails.
        removeWorkItemFromCache('today', prompt.shift.id);
        setShifts((current) => current.filter((item) => item.id !== prompt.shift.id));
      }
      invalidateWorkListCache('completed');
      invalidateWorkListCache('shift_counts');
      void loadCounts({ force: true });
      setNotice({
        title: 'Shift ended',
        message: applyBreak
          ? 'Your shift has ended. 30 minutes were deducted for your break.'
          : breakEligible
            ? 'Your shift has ended. No break time was deducted.'
            : 'Your shift has ended.',
      });
    } catch (actionError) {
      const message = mutationConflictMessage(
        actionError,
        'Unable to end your shift. Please try again.',
      );
      setNotice({
        title: actionError instanceof ShiftLocationError ? 'Location required' : 'Unable to end shift',
        message,
        canOpenSettings: actionError instanceof ShiftLocationError && actionError.canOpenSettings,
      });
    } finally {
      actionBusy.current = false;
      setBusyApplicationId(null);
    }
  };

  const runShiftAction = async (shift: TodayShift, mode: 'start' | 'end') => {
    if (actionBusy.current) return;
    if (mode === 'start' && shift.shift !== null) return;
    if (mode === 'end' && (shift.shift === null || !Number.isInteger(shift.shift))) return;

    actionBusy.current = true;
    setBusyApplicationId(shift.id);
    try {
      const location = await getFreshShiftLocation();
      if (mode === 'start') {
        const punchedAt = Date.now();
        const shiftId = await punchIn(shift.id, {
          latitude: location.latitude,
          longitude: location.longitude,
        });
        localPunchInAt.current[shift.id] = punchedAt;
        setShifts((current) => {
          const next = current.map((item) =>
            item.id === shift.id
              ? { ...item, shift: shiftId, punch_in: new Date(punchedAt).toISOString() }
              : item,
          );
          setWorkListCache('today', next);
          return next;
        });
        setNotice({
          title: 'Shift started',
          message: 'Your location was verified and your shift has started. You can end it anytime while at the facility.',
        });
      } else {
        const prompt = {
          shift,
          latitude: location.latitude,
          longitude: location.longitude,
        };
        // Backend only deducts a 30-minute break when worked time is >= 30 minutes.
        if (
          isBreakDeductionEligible(shift, localPunchInAt.current[shift.id])
        ) {
          setBreakPrompt(prompt);
        } else {
          await finishPunchOut(prompt, false, { alreadyBusy: true });
          return;
        }
      }
    } catch (actionError) {
      const message = mutationConflictMessage(
        actionError,
        mode === 'start'
          ? 'Unable to start your shift. Please try again.'
          : 'Unable to end your shift. Please try again.',
      );
      if (mode === 'start' && shouldDropStaleWorkItem(actionError)) {
        removeWorkItemFromCache('today', shift.id);
        setShifts((current) => current.filter((item) => item.id !== shift.id));
        void loadShifts({ force: true });
      }
      setNotice({
        title: actionError instanceof ShiftLocationError
          ? 'Location required'
          : mode === 'start'
            ? 'Unable to start shift'
            : 'Unable to end shift',
        message,
        canOpenSettings: actionError instanceof ShiftLocationError && actionError.canOpenSettings,
      });
    } finally {
      actionBusy.current = false;
      setBusyApplicationId(null);
    }
  };

  const confirmShiftAction = (shift: TodayShift, mode: 'start' | 'end') => {
    if (actionBusy.current) return;
    if (mode === 'start' && shift.shift !== null) return;
    if (mode === 'end' && shift.shift === null) return;
    setConfirming({ shift, mode });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.welcomeBanner}>
          <Text style={styles.welcomeTitle}>Welcome Back...!</Text>
          <Text style={styles.welcomeText}>
            Your trusted partner in healthcare staffing solutions.
          </Text>
        </View>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Today’s shifts</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh today’s shifts"
            onPress={() => void loadShifts({ force: true })}
            disabled={loading}>
            <MaterialIcons name="refresh" size={23} color={FORM_PRIMARY} />
          </Pressable>
        </View>

        {loading && shifts.length === 0 ? (
          <View style={styles.shiftList}>
            {[0, 1].map((item) => (
              <View key={item} style={styles.card}>
                <View style={styles.cardHeading}>
                  <Skeleton style={styles.skeletonIcon} />
                  <View style={styles.facilityDetails}>
                    <Skeleton style={{ width: '66%', height: 16 }} />
                    <Skeleton style={{ width: '42%', height: 13 }} />
                  </View>
                </View>
                <SkeletonLines count={2} />
                <Skeleton style={{ width: '100%', height: 44, borderRadius: 9 }} />
              </View>
            ))}
          </View>
        ) : error ? (
          <View style={styles.statePanel}>
            <MaterialIcons name="wifi-off" size={28} color="#b42318" />
            <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadShifts({ force: true })}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : shifts.length === 0 ? (
          <View style={styles.statePanel}>
            <MaterialIcons name="event-available" size={32} color="#98a2b3" />
            <Text style={styles.emptyTitle}>No shifts scheduled for today</Text>
          </View>
        ) : (
          <View style={styles.shiftList}>
            {shifts.map((shift) => {
              const started = shift.shift !== null;
              const busy = busyApplicationId === shift.id;
              return (
                <View key={shift.id} style={styles.card}>
                  <View style={styles.cardHeading}>
                    <View style={styles.facilityIcon}>
                      <MaterialIcons name="local-hospital" size={22} color={FORM_PRIMARY} />
                    </View>
                    <View style={styles.facilityDetails}>
                      <Text style={styles.facilityName}>{shift.facility}</Text>
                      <Text style={styles.position}>{shift.position}</Text>
                    </View>
                  </View>
                  <View style={styles.detailRow}>
                    <MaterialIcons name="event" size={18} color="#667085" />
                    <Text style={styles.detailText}>{formatWorkDate(shift.start_date)}</Text>
                    <MaterialIcons name="schedule" size={18} color="#667085" />
                    <Text style={styles.detailText}>{formatShiftTiming(shift.timing)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <MaterialIcons name="place" size={18} color="#667085" />
                    <Text style={styles.detailText}>{shift.state}</Text>
                    <Text style={styles.pay}>{formatMoney(shift.pay_rate)}</Text>
                  </View>
                  {started ? (
                    <>
                      <View style={styles.startedBadge}>
                        <MaterialIcons name="check-circle" size={19} color="#067647" />
                        <Text style={styles.startedText}>Shift in progress</Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        style={[styles.endButton, busy && styles.disabled]}
                        onPress={() => confirmShiftAction(shift, 'end')}
                        disabled={busyApplicationId !== null}>
                        {busy
                          ? <ActivityIndicator color="#fff" />
                          : <Text style={styles.startButtonText}>End Shift</Text>}
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      style={[styles.startButton, busy && styles.disabled]}
                      onPress={() => confirmShiftAction(shift, 'start')}
                      disabled={busyApplicationId !== null}>
                      {busy
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.startButtonText}>Start Shift</Text>}
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}
        <View style={styles.summaryHeader}>
          <Text style={styles.sectionTitle}>Your shifts</Text>
          {countsError ? (
            <Pressable accessibilityRole="button" onPress={() => void loadCounts({ force: true })} disabled={countsLoading}>
              <Text style={styles.retryText}>{countsLoading ? 'Loading…' : 'Retry totals'}</Text>
            </Pressable>
          ) : null}
        </View>
        {countsError ? <Text accessibilityRole="alert" style={styles.summaryError}>{countsError}</Text> : null}
        <View style={styles.summaryRow}>
          <Pressable
            accessibilityRole="button"
            style={styles.summaryCard}
            onPress={() => router.push({ pathname: '/(tabs)/shifts', params: { tab: 'available' } })}>
            <MaterialIcons name="work-outline" size={23} color={FORM_PRIMARY} />
            <Text style={styles.summaryLabel}>Available shifts</Text>
            {countsLoading && !shiftCounts
              ? <Skeleton style={{ width: 31, height: 24 }} />
              : <Text style={styles.summaryCount}>{shiftCounts?.available ?? '—'}</Text>}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.summaryCard}
            onPress={() => router.push({ pathname: '/(tabs)/shifts', params: { tab: 'completed' } })}>
            <MaterialIcons name="task-alt" size={23} color={FORM_PRIMARY} />
            <Text style={styles.summaryLabel}>Completed shifts</Text>
            {countsLoading && !shiftCounts
              ? <Skeleton style={{ width: 31, height: 24 }} />
              : <Text style={styles.summaryCount}>{shiftCounts?.completed ?? '—'}</Text>}
          </Pressable>
        </View>
      </ScrollView>
      <Modal
        transparent
        animationType="fade"
        visible={confirming !== null || breakPrompt !== null || notice !== null}
        onRequestClose={() => {
          if (actionBusy.current) return;
          setConfirming(null);
          setBreakPrompt(null);
          setNotice(null);
        }}>
        <View style={styles.modalOverlay}>
          <View style={styles.dialog}>
            {confirming ? (
              <>
                <Text style={styles.dialogTitle}>
                  {confirming.mode === 'start' ? 'Start this shift?' : 'End this shift?'}
                </Text>
                <Text style={styles.dialogMessage}>
                  {confirming.mode === 'start'
                    ? `Location access is required. We’ll confirm you’re at ${confirming.shift.facility} before starting, even if the scheduled time hasn’t begun yet.`
                    : `Location access is required. We’ll confirm you’re still at ${confirming.shift.facility} before ending this shift.`}
                </Text>
                <View style={styles.dialogActions}>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.cancelButton}
                    onPress={() => setConfirming(null)}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.confirmButton}
                    onPress={() => {
                      const action = confirming;
                      setConfirming(null);
                      void runShiftAction(action.shift, action.mode);
                    }}>
                    <Text style={styles.confirmButtonText}>
                      {confirming.mode === 'start' ? 'Start Shift' : 'End Shift'}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : breakPrompt ? (
              <>
                <Text style={styles.dialogTitle}>Break time</Text>
                <Text style={styles.dialogMessage}>
                  A 30-minute break will be deducted from your paid shift time. If you did not take a break, choose the option on the left.
                </Text>
                <View style={styles.breakActions}>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.noBreakButton}
                    disabled={busyApplicationId !== null}
                    onPress={() => void finishPunchOut(breakPrompt, false)}>
                    <Text style={styles.noBreakButtonText}>I didn’t take a break</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.confirmButton}
                    disabled={busyApplicationId !== null}
                    onPress={() => void finishPunchOut(breakPrompt, true)}>
                    <Text style={styles.confirmButtonText}>OK</Text>
                  </Pressable>
                </View>
              </>
            ) : notice ? (
              <>
                <Text style={styles.dialogTitle}>{notice.title}</Text>
                <Text accessibilityRole="alert" style={styles.dialogMessage}>{notice.message}</Text>
                {notice.canOpenSettings ? (
                  <View style={styles.dialogActions}>
                    <Pressable
                      accessibilityRole="button"
                      style={styles.cancelButton}
                      onPress={() => setNotice(null)}>
                      <Text style={styles.cancelButtonText}>Not now</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      style={styles.confirmButton}
                      onPress={() => {
                        setNotice(null);
                        void Linking.openSettings().catch(() => {
                          setNotice({
                            title: 'Settings unavailable',
                            message: 'Open your device settings and enable location access for IsentCare.',
                          });
                        });
                      }}>
                      <Text style={styles.confirmButtonText}>Open Settings</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    style={styles.confirmButton}
                    onPress={() => setNotice(null)}>
                    <Text style={styles.confirmButtonText}>OK</Text>
                  </Pressable>
                )}
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 18, gap: 16 },
  welcomeBanner: { minHeight: 142, justifyContent: 'center', alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingVertical: 22, borderBottomLeftRadius: 38, borderBottomRightRadius: 38, backgroundColor: '#eaf3fb' },
  welcomeTitle: { color: '#263341', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  welcomeText: { maxWidth: 320, color: '#475467', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#344054', fontSize: 18, fontWeight: '700' },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1, minHeight: 118, alignItems: 'flex-start', justifyContent: 'space-between', padding: 14, gap: 8, borderRadius: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7edf3', elevation: 1 },
  summaryLabel: { color: '#475467', fontSize: 13, fontWeight: '600' },
  summaryCount: { color: '#263341', fontSize: 23, fontWeight: '700' },
  summaryError: { color: '#b42318', fontSize: 13 },
  shiftList: { gap: 12 },
  card: { padding: 16, gap: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7edf3', elevation: 1 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  facilityIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#eaf3fb' },
  skeletonIcon: { width: 44, height: 44, borderRadius: 13 },
  facilityDetails: { flex: 1, gap: 3 },
  facilityName: { color: '#263341', fontSize: 16, fontWeight: '700' },
  position: { color: '#667085', fontSize: 13 },
  detailRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  detailText: { color: '#475467', fontSize: 13 },
  pay: { marginLeft: 'auto', color: '#263341', fontSize: 15, fontWeight: '700' },
  startButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: FORM_PRIMARY },
  endButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#b42318' },
  startButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  startedBadge: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 9, backgroundColor: '#ecfdf3' },
  startedText: { color: '#067647', fontSize: 14, fontWeight: '700' },
  statePanel: { minHeight: 190, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7edf3' },
  emptyTitle: { color: '#344054', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  mutedText: { color: '#667085', fontSize: 14, textAlign: 'center' },
  errorText: { color: '#b42318', fontSize: 14, textAlign: 'center' },
  retryText: { padding: 8, color: FORM_PRIMARY, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(16, 24, 40, 0.55)' },
  dialog: { width: '100%', maxWidth: 420, padding: 20, gap: 14, borderRadius: 16, backgroundColor: '#fff', elevation: 8 },
  dialogTitle: { color: '#263341', fontSize: 18, fontWeight: '700' },
  dialogMessage: { color: '#475467', fontSize: 15, lineHeight: 22 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  breakActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 },
  cancelButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 9, borderWidth: 1, borderColor: '#d0d5dd' },
  cancelButtonText: { color: '#344054', fontSize: 14, fontWeight: '600' },
  noBreakButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: '#d0d5dd' },
  noBreakButtonText: { color: '#344054', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  confirmButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 9, backgroundColor: FORM_PRIMARY },
  confirmButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
