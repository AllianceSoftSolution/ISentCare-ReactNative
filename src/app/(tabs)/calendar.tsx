import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchCalendarShifts, type CalendarShift } from '@/api/calendar';
import { formatMoney, formatShiftTiming, formatWorkDate } from '@/api/work';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';
import { Skeleton, SkeletonLines } from '@/components/ui/Skeleton';

const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function CalendarScreen() {
  const [focusedMonth, setFocusedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [events, setEvents] = useState<CalendarShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const year = focusedMonth.getFullYear();
  const month = focusedMonth.getMonth() + 1;
  const fetchEvents = useCallback(async () => {
    const currentRequest = ++requestId.current;
    try {
      const results = await fetchCalendarShifts(year, month);
      if (currentRequest === requestId.current) setEvents(results);
    } catch (loadError) {
      if (currentRequest === requestId.current) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load your calendar.');
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [month, year]);

  useFocusEffect(useCallback(() => {
    const request = setTimeout(() => {
      setLoading(true);
      setError(null);
      setEvents([]);
      void fetchEvents();
    }, 0);
    return () => {
      clearTimeout(request);
      requestId.current += 1;
    };
  }, [fetchEvents]));

  const loadEvents = () => {
    setLoading(true);
    setError(null);
    void fetchEvents();
  };

  const moveMonth = (amount: number) => {
    const nextMonth = new Date(year, month - 1 + amount, 1);
    const day = Number(selectedDate.slice(-2));
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    setLoading(true);
    setError(null);
    setEvents([]);
    setSelectedDate(dateKey(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(day, lastDay))));
    setFocusedMonth(nextMonth);
  };

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const calendarCells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const eventDates = new Set(
    events.flatMap((event) => {
      const date = parseDate(event.job?.start_date);
      return date ? [dateKey(date)] : [];
    }),
  );
  const selectedEvents = events.filter((event) => {
    const date = parseDate(event.job?.start_date);
    return date ? dateKey(date) === selectedDate : false;
  });
  const selectedDateValue = parseDate(selectedDate);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Calendar</Text>
        <View style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              hitSlop={8}
              onPress={() => moveMonth(-1)}
              style={styles.monthButton}>
              <MaterialIcons name="chevron-left" size={25} color="#344054" />
            </Pressable>
            <Text style={styles.monthTitle}>
              {new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(focusedMonth)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              hitSlop={8}
              onPress={() => moveMonth(1)}
              style={styles.monthButton}>
              <MaterialIcons name="chevron-right" size={25} color="#344054" />
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {weekDays.map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.weekDay}>{day}</Text>
            ))}
          </View>
          <View style={styles.daysGrid}>
            {calendarCells.map((day, index) => {
              if (!day) return <View key={`empty-${index}`} style={styles.dayCell} />;
              const cellDate = dateKey(new Date(year, month - 1, day));
              const selected = cellDate === selectedDate;
              const today = cellDate === dateKey(new Date());
              const hasEvent = eventDates.has(cellDate);
              return (
                <Pressable
                  key={cellDate}
                  accessibilityRole="button"
                  accessibilityLabel={`${new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(year, month - 1, day))}${hasEvent ? ', has shifts' : ''}`}
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedDate(cellDate)}
                  style={styles.dayCell}>
                  <View style={[
                    styles.dayCircle,
                    today && styles.todayCircle,
                    selected && styles.selectedCircle,
                  ]}>
                    <Text style={[
                      styles.dayText,
                      today && styles.todayText,
                      selected && styles.selectedText,
                    ]}>{day}</Text>
                  </View>
                  <View style={[styles.eventDot, hasEvent && styles.eventDotActive]} />
                </Pressable>
              );
            })}
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: FORM_PRIMARY }]} />
              <Text style={styles.legendText}>Scheduled shift</Text>
            </View>
            <Text style={styles.legendText}>Today</Text>
          </View>
        </View>

        <View style={styles.eventsHeader}>
          <View>
            <Text style={styles.sectionTitle}>Shifts</Text>
            {selectedDateValue ? (
              <Text style={styles.selectedDateText}>{formatWorkDate(selectedDate)}</Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh calendar"
            onPress={loadEvents}
            disabled={loading}>
            <MaterialIcons name="refresh" size={22} color={FORM_PRIMARY} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.eventList}>
            {[0, 1].map((item) => (
              <View key={item} style={styles.eventCard}>
                <Skeleton style={{ width: '68%', height: 17 }} />
                <SkeletonLines count={2} />
              </View>
            ))}
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <MaterialIcons name="wifi-off" size={28} color="#b42318" />
            <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={loadEvents}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : selectedEvents.length ? (
          <View style={styles.eventList}>
            {selectedEvents.map((event) => (
              <View key={event.id} style={styles.eventCard}>
                <View style={styles.eventTitleRow}>
                  <Text style={styles.facility} numberOfLines={2}>
                    {event.job?.facility || 'Facility unavailable'}
                  </Text>
                  <Text style={styles.rate}>{formatMoney(event.job?.bill_rate)}</Text>
                </View>
                <View style={styles.eventDetailRow}>
                  <MaterialIcons name="schedule" size={17} color="#667085" />
                  <Text style={styles.eventDetail}>{formatShiftTiming(event.job?.timing)}</Text>
                </View>
                {event.job?.state ? (
                  <View style={styles.eventDetailRow}>
                    <MaterialIcons name="place" size={17} color="#667085" />
                    <Text style={styles.eventDetail}>{event.job.state}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.stateCard}>
            <MaterialIcons name="event-available" size={30} color="#98a2b3" />
            <Text style={styles.emptyText}>No shifts scheduled for this day.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 18, gap: 16 },
  title: { color: '#263341', fontSize: 24, fontWeight: '700' },
  calendarCard: { padding: 14, gap: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7edf3', elevation: 1 },
  monthHeader: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { color: '#263341', fontSize: 17, fontWeight: '700' },
  weekRow: { flexDirection: 'row' },
  weekDay: { width: '14.2857%', color: '#667085', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.2857%', minHeight: 46, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayCircle: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  todayCircle: { borderWidth: 1, borderColor: '#f79009' },
  selectedCircle: { backgroundColor: FORM_PRIMARY, borderColor: FORM_PRIMARY },
  dayText: { color: '#344054', fontSize: 14 },
  todayText: { color: '#b54708', fontWeight: '700' },
  selectedText: { color: '#fff', fontWeight: '700' },
  eventDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  eventDotActive: { backgroundColor: FORM_PRIMARY },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { color: '#667085', fontSize: 12 },
  eventsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#344054', fontSize: 18, fontWeight: '700' },
  selectedDateText: { marginTop: 3, color: '#667085', fontSize: 13 },
  stateCard: { minHeight: 150, alignItems: 'center', justifyContent: 'center', padding: 22, gap: 11, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7edf3' },
  mutedText: { color: '#667085', fontSize: 14 },
  errorText: { color: '#b42318', fontSize: 14, textAlign: 'center' },
  retryText: { padding: 6, color: FORM_PRIMARY, fontWeight: '700' },
  emptyText: { color: '#667085', fontSize: 14, textAlign: 'center' },
  eventList: { gap: 10 },
  eventCard: { gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#eff6fc' },
  eventTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  facility: { flex: 1, color: '#263341', fontSize: 16, fontWeight: '700' },
  rate: { color: '#263341', fontSize: 15, fontWeight: '700' },
  eventDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eventDetail: { color: '#475467', fontSize: 13 },
});
