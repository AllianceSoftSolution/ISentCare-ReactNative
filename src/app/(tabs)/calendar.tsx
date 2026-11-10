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
import { fetchHolidays, isCompanyHoliday, type Holiday } from '@/api/holidays';
import { formatMoney, formatShiftTiming, formatWorkDate } from '@/api/work';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';
import { Skeleton, SkeletonLines } from '@/components/ui/Skeleton';

const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const COMPANY_HOLIDAY_COLOR = '#198754';
const US_HOLIDAY_COLOR = '#0d6efd';

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

function holidayDateKey(holiday: Holiday) {
  return holiday.date.slice(0, 10);
}

export default function CalendarScreen() {
  const [focusedMonth, setFocusedMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [events, setEvents] = useState<CalendarShift[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const requestId = useRef(0);
  const holidayCache = useRef<Record<number, Holiday[]>>({});

  const year = focusedMonth.getFullYear();
  const month = focusedMonth.getMonth() + 1;

  const fetchMonthData = useCallback(async () => {
    const currentRequest = ++requestId.current;
    try {
      const holidayPromise = holidayCache.current[year]
        ? Promise.resolve(holidayCache.current[year])
        : fetchHolidays(year).then((rows) => {
          holidayCache.current[year] = rows;
          return rows;
        });

      const [shiftResults, holidayResults] = await Promise.all([
        fetchCalendarShifts(year, month),
        holidayPromise.then(
          (rows) => ({ ok: true as const, rows }),
          (loadError: unknown) => ({
            ok: false as const,
            message: loadError instanceof Error ? loadError.message : 'Unable to load holidays.',
          }),
        ),
      ]);

      if (currentRequest !== requestId.current) return;

      setEvents(shiftResults);
      setError(null);

      if (holidayResults.ok) {
        setHolidays(holidayResults.rows);
        setHolidayError(null);
      } else {
        setHolidays([]);
        setHolidayError(holidayResults.message);
      }
    } catch (loadError) {
      if (currentRequest === requestId.current) {
        setEvents([]);
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
      setHolidayError(null);
      setEvents([]);
      void fetchMonthData();
    }, 0);
    return () => {
      clearTimeout(request);
      requestId.current += 1;
    };
  }, [fetchMonthData]));

  const loadEvents = () => {
    delete holidayCache.current[year];
    setLoading(true);
    setError(null);
    setHolidayError(null);
    void fetchMonthData();
  };

  const moveMonth = (amount: number) => {
    const nextMonth = new Date(year, month - 1 + amount, 1);
    const day = Number(selectedDate.slice(-2));
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    setLoading(true);
    setError(null);
    setHolidayError(null);
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
  const holidaysByDate = holidays.reduce<Record<string, Holiday[]>>((acc, holiday) => {
    const key = holidayDateKey(holiday);
    if (!key.startsWith(`${year}-${String(month).padStart(2, '0')}-`)) return acc;
    (acc[key] ||= []).push(holiday);
    return acc;
  }, {});
  const selectedEvents = events.filter((event) => {
    const date = parseDate(event.job?.start_date);
    return date ? dateKey(date) === selectedDate : false;
  });
  const selectedHolidays = holidaysByDate[selectedDate] ?? [];
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
              const dayHolidays = holidaysByDate[cellDate] ?? [];
              const hasHoliday = dayHolidays.length > 0;
              const hasCompanyHoliday = dayHolidays.some(isCompanyHoliday);
              const hasUsHoliday = dayHolidays.some((holiday) => !isCompanyHoliday(holiday));
              return (
                <Pressable
                  key={cellDate}
                  accessibilityRole="button"
                  accessibilityLabel={`${new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(year, month - 1, day))}${hasEvent ? ', has shifts' : ''}${hasHoliday ? ', holiday' : ''}`}
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedDate(cellDate)}
                  style={styles.dayCell}>
                  <View style={[
                    styles.dayCircle,
                    today && styles.todayCircle,
                    hasHoliday && !selected && styles.holidayCircle,
                    selected && styles.selectedCircle,
                  ]}>
                    <Text style={[
                      styles.dayText,
                      today && styles.todayText,
                      hasHoliday && !selected && styles.holidayText,
                      selected && styles.selectedText,
                    ]}>{day}</Text>
                  </View>
                  <View style={styles.markerRow}>
                    <View style={[styles.eventDot, hasEvent && styles.eventDotActive]} />
                    <View style={[
                      styles.eventDot,
                      hasCompanyHoliday && { backgroundColor: COMPANY_HOLIDAY_COLOR },
                      !hasCompanyHoliday && hasUsHoliday && { backgroundColor: US_HOLIDAY_COLOR },
                    ]} />
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: FORM_PRIMARY }]} />
              <Text style={styles.legendText}>Shift</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: COMPANY_HOLIDAY_COLOR }]} />
              <Text style={styles.legendText}>Company holiday</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: US_HOLIDAY_COLOR }]} />
              <Text style={styles.legendText}>US holiday</Text>
            </View>
          </View>
        </View>

        {holidayError ? (
          <View style={styles.holidayNotice}>
            <MaterialIcons name="event-busy" size={18} color="#b54708" />
            <Text style={styles.holidayNoticeText}>{holidayError}</Text>
          </View>
        ) : null}

        <View style={styles.eventsHeader}>
          <View>
            <Text style={styles.sectionTitle}>Day details</Text>
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
        ) : selectedHolidays.length || selectedEvents.length ? (
          <View style={styles.eventList}>
            {selectedHolidays.map((holiday) => {
              const company = isCompanyHoliday(holiday);
              return (
                <View
                  key={`holiday-${holiday.id}`}
                  style={[
                    styles.holidayCard,
                    { borderLeftColor: company ? COMPANY_HOLIDAY_COLOR : US_HOLIDAY_COLOR },
                  ]}>
                  <View style={styles.eventTitleRow}>
                    <Text style={styles.facility} numberOfLines={2}>{holiday.name}</Text>
                    <View style={[
                      styles.holidayBadge,
                      { backgroundColor: company ? COMPANY_HOLIDAY_COLOR : US_HOLIDAY_COLOR },
                    ]}>
                      <Text style={styles.holidayBadgeText}>{company ? 'Company' : 'US'}</Text>
                    </View>
                  </View>
                  <View style={styles.eventDetailRow}>
                    <MaterialIcons name="celebration" size={17} color="#667085" />
                    <Text style={styles.eventDetail}>
                      {company ? 'Company holiday' : 'US federal holiday'}
                    </Text>
                  </View>
                </View>
              );
            })}
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
            <Text style={styles.emptyText}>No shifts or holidays for this day.</Text>
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
  holidayCircle: { backgroundColor: '#ecfdf3' },
  selectedCircle: { backgroundColor: FORM_PRIMARY, borderColor: FORM_PRIMARY },
  dayText: { color: '#344054', fontSize: 14 },
  todayText: { color: '#b54708', fontWeight: '700' },
  holidayText: { color: '#027a48', fontWeight: '600' },
  selectedText: { color: '#fff', fontWeight: '700' },
  markerRow: { minHeight: 4, flexDirection: 'row', alignItems: 'center', gap: 3 },
  eventDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  eventDotActive: { backgroundColor: FORM_PRIMARY },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingTop: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { color: '#667085', fontSize: 12 },
  holidayNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fffaeb',
    borderWidth: 1,
    borderColor: '#fedf89',
  },
  holidayNoticeText: { flex: 1, color: '#b54708', fontSize: 13 },
  eventsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#344054', fontSize: 18, fontWeight: '700' },
  selectedDateText: { marginTop: 3, color: '#667085', fontSize: 13 },
  stateCard: { minHeight: 150, alignItems: 'center', justifyContent: 'center', padding: 22, gap: 11, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7edf3' },
  errorText: { color: '#b42318', fontSize: 14, textAlign: 'center' },
  retryText: { padding: 6, color: FORM_PRIMARY, fontWeight: '700' },
  emptyText: { color: '#667085', fontSize: 14, textAlign: 'center' },
  eventList: { gap: 10 },
  eventCard: { gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#eff6fc' },
  holidayCard: {
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderLeftWidth: 4,
  },
  holidayBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  holidayBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  eventTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  facility: { flex: 1, color: '#263341', fontSize: 16, fontWeight: '700' },
  rate: { color: '#263341', fontSize: 15, fontWeight: '700' },
  eventDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eventDetail: { color: '#475467', fontSize: 13 },
});
