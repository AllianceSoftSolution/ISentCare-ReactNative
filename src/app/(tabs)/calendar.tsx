import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchCalendarShifts, type CalendarShift } from '@/api/calendar';
import { fetchHolidays, isCompanyHoliday, type Holiday } from '@/api/holidays';
import { formatMoney, formatShiftTiming, formatWorkDate } from '@/api/work';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';
import { getWorkListCache, setWorkListCache } from '@/store/workListCache';

const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
/** Shift markers stay on brand blue; holidays use warm/violet so they never read as shifts. */
const SHIFT_COLOR = FORM_PRIMARY;
const COMPANY_HOLIDAY_COLOR = '#c2410c';
const US_HOLIDAY_COLOR = '#7c3aed';
const HOLIDAY_DAY_BG = '#fff7ed';
const HOLIDAY_DAY_TEXT = '#c2410c';

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
  const { width: windowWidth } = useWindowDimensions();
  const isCompact = windowWidth < 420;
  const contentPad = isCompact ? 12 : 18;
  const calendarPad = isCompact ? 10 : 14;
  const dayCircleSize = isCompact ? 36 : 32;

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

  const fetchMonthData = useCallback(async (options?: { force?: boolean; clearHolidays?: boolean }) => {
    const currentRequest = ++requestId.current;
    const cached = getWorkListCache('calendar');
    const cacheMatchesMonth =
      cached && cached.data.year === year && cached.data.month === month;

    if (cacheMatchesMonth) {
      setEvents(cached.data.events);
      if (!options?.force) setLoading(false);
    } else {
      setEvents([]);
      setLoading(true);
    }

    setError(null);
    if (holidayCache.current[year] && !options?.clearHolidays) {
      setHolidays(holidayCache.current[year]);
      setHolidayError(null);
    } else if (!holidayCache.current[year]) {
      setHolidayError(null);
    }

    try {
      if (options?.clearHolidays) delete holidayCache.current[year];

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
      setWorkListCache('calendar', { year, month, events: shiftResults });

      if (holidayResults.ok) {
        setHolidays(holidayResults.rows);
        setHolidayError(null);
      } else if (!holidayCache.current[year]) {
        setHolidays([]);
        setHolidayError(holidayResults.message);
      }
    } catch (loadError) {
      if (currentRequest === requestId.current && !cacheMatchesMonth) {
        setEvents([]);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load your calendar.');
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [month, year]);

  useFocusEffect(useCallback(() => {
    const request = setTimeout(() => {
      void fetchMonthData();
    }, 0);
    return () => {
      clearTimeout(request);
      requestId.current += 1;
    };
  }, [fetchMonthData]));

  const loadEvents = () => {
    void fetchMonthData({ force: true, clearHolidays: true });
  };

  const moveMonth = (amount: number) => {
    const nextMonth = new Date(year, month - 1 + amount, 1);
    const day = Number(selectedDate.slice(-2));
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
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
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.container, { paddingHorizontal: contentPad, paddingBottom: contentPad + 8 }]}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Calendar</Text>
        <View style={[styles.calendarCard, { padding: calendarPad }]}>
          <View style={styles.monthHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              hitSlop={8}
              disabled={loading}
              onPress={() => moveMonth(-1)}
              style={styles.monthButton}>
              <MaterialIcons name="chevron-left" size={28} color="#344054" />
            </Pressable>
            <View style={styles.monthTitleWrap}>
              <Text style={[styles.monthTitle, isCompact && styles.monthTitleCompact]} numberOfLines={1}>
                {new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(focusedMonth)}
              </Text>
              {loading ? (
                <ActivityIndicator size="small" color={FORM_PRIMARY} style={styles.monthSpinner} />
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              hitSlop={8}
              disabled={loading}
              onPress={() => moveMonth(1)}
              style={styles.monthButton}>
              <MaterialIcons name="chevron-right" size={28} color="#344054" />
            </Pressable>
          </View>

          <View style={styles.calendarBody}>
            <View style={styles.weekRow}>
              {weekDays.map((day, index) => (
                <View key={`${day}-${index}`} style={styles.dayCell}>
                  <Text style={[styles.weekDay, isCompact && styles.weekDayCompact]}>{day}</Text>
                </View>
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
                      { width: dayCircleSize, height: dayCircleSize, borderRadius: dayCircleSize / 2 },
                      today && styles.todayCircle,
                      hasHoliday && !selected && styles.holidayCircle,
                      selected && styles.selectedCircle,
                    ]}>
                      <Text style={[
                        styles.dayText,
                        isCompact && styles.dayTextCompact,
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

          </View>

          <View style={[styles.legend, isCompact && styles.legendCompact]}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: SHIFT_COLOR }]} />
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
          <View style={styles.eventsHeaderText}>
            <Text style={styles.sectionTitle}>Day details</Text>
            {selectedDateValue ? (
              <Text style={styles.selectedDateText}>{formatWorkDate(selectedDate)}</Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh calendar"
            onPress={loadEvents}
            disabled={loading}
            hitSlop={8}
            style={styles.refreshButton}>
            <MaterialIcons name="refresh" size={22} color={FORM_PRIMARY} />
          </Pressable>
        </View>

        {error ? (
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
              <View key={event.id} style={[styles.eventCard, { borderLeftColor: SHIFT_COLOR }]}>
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
  safeArea: { flex: 1, backgroundColor: '#f5f7fa' },
  scroll: { flex: 1, width: '100%' },
  container: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingTop: 12,
    gap: 14,
  },
  title: { color: '#263341', fontSize: 24, fontWeight: '700' },
  calendarCard: {
    width: '100%',
    gap: 10,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7edf3',
    overflow: 'hidden',
  },
  monthHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  monthTitle: { color: '#263341', fontSize: 17, fontWeight: '700', flexShrink: 1 },
  monthTitleCompact: { fontSize: 16 },
  monthSpinner: { marginLeft: 2 },
  calendarBody: { position: 'relative', width: '100%' },
  weekRow: { flexDirection: 'row', width: '100%', marginBottom: 4 },
  weekDay: { color: '#667085', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  weekDayCompact: { fontSize: 13 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
  dayCell: {
    width: '14.2857%',
    maxWidth: '14.2857%',
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 2,
  },
  dayCircle: { alignItems: 'center', justifyContent: 'center' },
  todayCircle: { borderWidth: 1.5, borderColor: '#f79009' },
  holidayCircle: { backgroundColor: HOLIDAY_DAY_BG },
  selectedCircle: { backgroundColor: SHIFT_COLOR, borderColor: SHIFT_COLOR },
  dayText: { color: '#344054', fontSize: 14, fontWeight: '500' },
  dayTextCompact: { fontSize: 15 },
  todayText: { color: '#b54708', fontWeight: '700' },
  holidayText: { color: HOLIDAY_DAY_TEXT, fontWeight: '600' },
  selectedText: { color: '#fff', fontWeight: '700' },
  markerRow: { minHeight: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  eventDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  eventDotActive: { backgroundColor: SHIFT_COLOR },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    paddingTop: 4,
  },
  legendCompact: { gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
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
  holidayNoticeText: { flex: 1, minWidth: 0, color: '#b54708', fontSize: 13 },
  eventsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eventsHeaderText: { flex: 1, minWidth: 0 },
  sectionTitle: { color: '#344054', fontSize: 18, fontWeight: '700' },
  selectedDateText: { marginTop: 3, color: '#667085', fontSize: 13 },
  refreshButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  stateCard: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    gap: 11,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7edf3',
  },
  errorText: { color: '#b42318', fontSize: 14, textAlign: 'center' },
  retryText: { padding: 6, color: FORM_PRIMARY, fontWeight: '700' },
  emptyText: { color: '#667085', fontSize: 14, textAlign: 'center' },
  eventList: { gap: 10, width: '100%' },
  eventCard: {
    width: '100%',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#eff6fc',
    borderLeftWidth: 4,
  },
  holidayCard: {
    width: '100%',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff7ed',
    borderLeftWidth: 4,
  },
  holidayBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  holidayBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  eventTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  facility: { flex: 1, minWidth: 0, color: '#263341', fontSize: 16, fontWeight: '700' },
  rate: { color: '#263341', fontSize: 15, fontWeight: '700' },
  eventDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eventDetail: { flex: 1, minWidth: 0, color: '#475467', fontSize: 13 },
});
