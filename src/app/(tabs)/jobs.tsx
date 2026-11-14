import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { applyForWork, fetchWorkPage, itemName, type WorkItem } from '@/api/work';
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

function JobSkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Skeleton style={styles.skeletonIcon} />
        <View style={styles.cardHeading}>
          <Skeleton style={{ width: '68%', height: 16 }} />
          <Skeleton style={{ width: '42%', height: 13 }} />
        </View>
      </View>
      <SkeletonLines count={2} />
      <Skeleton style={{ width: '100%', height: 42, borderRadius: 9 }} />
    </View>
  );
}

function jobType(job: WorkItem) {
  if (job.fix_time) return 'Fix Term';
  if (job.tra_assign) return 'TRA Assign';
  if (job.per_place) return 'Per Place';
  return 'No Status Available';
}

export default function JobsScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [pendingJob, setPendingJob] = useState<WorkItem | null>(null);
  const [successVisible, setSuccessVisible] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const page = useRef(1);
  const request = useRef(0);
  const moreBusy = useRef(false);
  const applyBusy = useRef(false);

  const loadJobs = useCallback((options?: { force?: boolean }) => {
    const requestId = ++request.current;
    const cached = getWorkListCache('permanent');
    if (cached && !options?.force) {
      setJobs(cached.data.results);
      setHasMore(cached.data.hasMore);
      page.current = cached.data.page;
      setLoading(false);
    } else {
      setLoading(true);
      if (!cached) {
        setJobs([]);
        setHasMore(false);
        page.current = 1;
      }
    }
    setLoadingMore(false);
    setError(null);
    void fetchWorkPage<WorkItem>('/permanent_jobs/', 1)
      .then((result) => {
        if (requestId !== request.current) return;
        setJobs(result.results);
        setHasMore(result.hasMore);
        page.current = 1;
        setWorkListCache('permanent', {
          results: result.results,
          hasMore: result.hasMore,
          page: 1,
        });
      })
      .catch((loadError: unknown) => {
        if (requestId === request.current && !cached) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load jobs.');
        }
      })
      .finally(() => {
        if (requestId === request.current) setLoading(false);
      });
  }, []);

  useFocusEffect(useCallback(() => {
    loadJobs();
    return () => {
      request.current += 1;
    };
  }, [loadJobs]));

  const loadMore = async () => {
    if (moreBusy.current) return;
    moreBusy.current = true;
    setLoadingMore(true);
    setError(null);
    const requestId = request.current;
    const nextPage = page.current + 1;
    try {
      const result = await fetchWorkPage<WorkItem>('/permanent_jobs/', nextPage);
      if (requestId !== request.current) return;
      setJobs((current) => {
        const merged = [...current, ...result.results];
        setWorkListCache('permanent', {
          results: merged,
          hasMore: result.hasMore,
          page: nextPage,
        });
        return merged;
      });
      page.current = nextPage;
      setHasMore(result.hasMore);
    } catch (loadError) {
      if (requestId === request.current) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load more jobs.');
      }
    } finally {
      moreBusy.current = false;
      if (requestId === request.current) setLoadingMore(false);
    }
  };

  const requestApply = (job: WorkItem) => {
    if (applyBusy.current) return;
    setApplyError(null);
    setPendingJob(job);
  };

  const confirmApply = () => {
    if (!pendingJob || applyBusy.current) return;
    const job = pendingJob;
    setPendingJob(null);
    applyBusy.current = true;
    setApplyingId(job.id);
    void applyForWork('/permanent_job_applications/', job.id)
      .then(() => {
        removeWorkItemFromCache('permanent', job.id);
        setJobs((current) => current.filter((item) => item.id !== job.id));
        invalidateWorkListCache('shift_counts');
        setSuccessVisible(true);
      })
      .catch((error: unknown) => {
        const message = mutationConflictMessage(
          error,
          'Your application could not be submitted. Please try again.',
        );
        setApplyError(message);
        if (shouldDropStaleWorkItem(error) || isMutationConflictError(error)) {
          if (shouldDropStaleWorkItem(error)) {
            removeWorkItemFromCache('permanent', job.id);
            setJobs((current) => current.filter((item) => item.id !== job.id));
          }
          void loadJobs({ force: true });
        }
      })
      .finally(() => {
        applyBusy.current = false;
        setApplyingId(null);
      });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Permanent Jobs</Text>
        {error && jobs.length === 0 ? (
          <View style={styles.statusPanel}>
            <MaterialIcons name="wifi-off" size={26} color="#b42318" />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => loadJobs({ force: true })}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : loading && jobs.length === 0 ? (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            <JobSkeletonCard />
            <JobSkeletonCard />
            <JobSkeletonCard />
          </ScrollView>
        ) : jobs.length === 0 ? (
          <View style={styles.statusPanel}>
            <MaterialIcons name="work-off" size={34} color="#98a2b3" />
            <Text style={styles.emptyTitle}>No jobs available</Text>
            <Text style={styles.mutedText}>New permanent opportunities will appear here.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {error ? (
              <View style={styles.inlineError}>
                <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
                <Pressable accessibilityRole="button" onPress={() => void loadMore()}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : null}
            {jobs.map((job) => (
              <View key={job.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.jobIcon}>
                    <MaterialIcons name="work-outline" size={22} color={FORM_PRIMARY} />
                  </View>
                  <View style={styles.cardHeading}>
                    <Text style={styles.specialty}>{itemName(job.speciality) || 'Specialty unavailable'}</Text>
                    <Text style={styles.jobType}>{jobType(job)}</Text>
                  </View>
                </View>
                <Text style={styles.profession}>{itemName(job.profession) || 'Profession unavailable'}</Text>
                <View style={styles.location}>
                  <MaterialIcons name="place" size={18} color="#667085" />
                  <Text style={styles.locationText}>
                    {[job.city, job.state].filter(Boolean).join(', ') || 'Location unavailable'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.applyButton, applyingId === job.id && styles.disabled]}
                  onPress={() => requestApply(job)}
                  disabled={applyingId !== null}>
                  {applyingId === job.id
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.applyText}>Apply</Text>}
                </Pressable>
              </View>
            ))}
            {hasMore ? (
              <Pressable
                accessibilityRole="button"
                style={[styles.loadMore, loadingMore && styles.disabled]}
                onPress={() => void loadMore()}
                disabled={loadingMore}>
                {loadingMore
                  ? <ActivityIndicator color={FORM_PRIMARY} />
                  : <Text style={styles.loadMoreText}>Load More</Text>}
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </View>

      <ConfirmModal
        visible={pendingJob != null}
        title="Apply for this job?"
        message={`Submit an application for ${itemName(pendingJob?.profession) || 'this position'}?`}
        confirmLabel="Apply"
        destructive={false}
        busy={applyingId !== null}
        onCancel={() => {
          if (applyingId === null) setPendingJob(null);
        }}
        onConfirm={confirmApply}
      />

      <ConfirmModal
        visible={applyError != null}
        title="Unable to apply"
        message={applyError || ''}
        confirmLabel="OK"
        cancelLabel="Close"
        destructive={false}
        onCancel={() => setApplyError(null)}
        onConfirm={() => setApplyError(null)}
      />

      <SuccessTickModal
        visible={successVisible}
        title="Apply Successfully"
        message="Your job application was submitted."
        onDone={() => {
          setSuccessVisible(false);
          try {
            router.replace('/(tabs)/home');
          } catch {
            // Stay on Jobs if navigation is unavailable; apply already succeeded.
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f9fc' },
  container: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16 },
  title: { marginBottom: 14, color: '#263341', fontSize: 22, fontWeight: '700' },
  list: { paddingBottom: 24, gap: 12 },
  card: { padding: 16, gap: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7edf3', elevation: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  jobIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#eaf3fb' },
  skeletonIcon: { width: 42, height: 42, borderRadius: 12 },
  cardHeading: { flex: 1, gap: 4 },
  specialty: { color: '#263341', fontSize: 16, fontWeight: '700' },
  jobType: { alignSelf: 'flex-start', color: FORM_PRIMARY, fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: '#eaf3fb' },
  profession: { color: '#475467', fontSize: 14 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: { flex: 1, color: '#667085', fontSize: 13 },
  applyButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: FORM_PRIMARY },
  applyText: { color: '#fff', fontSize: 14, fontWeight: '700' },
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
