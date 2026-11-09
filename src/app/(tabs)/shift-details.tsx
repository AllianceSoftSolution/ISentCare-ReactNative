import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { applyForWork, formatWorkDate } from '@/api/work';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SuccessTickModal } from '@/components/ui/SuccessTickModal';

export default function ShiftDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    facility: string;
    date: string;
    timing: string;
    price: string;
  }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successVisible, setSuccessVisible] = useState(false);

  const pickShift = () => {
    const shiftId = Number(params.id);
    if (!Number.isInteger(shiftId) || shiftId < 1 || loading) {
      setError('This shift is unavailable. Return to the shifts list and try again.');
      return;
    }

    Alert.alert('Pick this shift?', `Apply to the shift at ${params.facility || 'this facility'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Pick',
        onPress: () => {
          setLoading(true);
          setError(null);
          void applyForWork('/per_diem_job_applications/', shiftId)
            .then(() => {
              setSuccessVisible(true);
            })
            .catch((applyError: unknown) => {
              setError(
                applyError instanceof Error
                  ? applyError.message
                  : 'Your application could not be submitted. Please try again.',
              );
            })
            .finally(() => setLoading(false));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <SuccessTickModal
        visible={successVisible}
        onDone={() => {
          setSuccessVisible(false);
          router.replace('/(tabs)/home');
        }}
      />
      <ScreenHeader title="Shift Details" onBack={() => router.back()} backLabel="Back to shifts" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.facilityIcon}>
            <MaterialIcons name="local-hospital" size={26} color={FORM_PRIMARY} />
          </View>
          <Text style={styles.facility}>{params.facility || 'Facility'}</Text>
          <Text style={styles.status}>Available</Text>
          <View style={styles.infoRow}>
            <MaterialIcons name="event" size={20} color={FORM_PRIMARY} />
            <Text style={styles.infoText}>{formatWorkDate(params.date)}</Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="schedule" size={20} color={FORM_PRIMARY} />
            <Text style={styles.infoText}>{params.timing || 'Timing unavailable'}</Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="payments" size={20} color={FORM_PRIMARY} />
            <Text style={styles.infoText}>{params.price || 'Pay unavailable'}</Text>
          </View>
        </View>

        <View
          accessible
          accessibilityLabel="Static map preview; it does not show the shift's precise location"
          style={styles.map}>
          <Image
            source={require('../../../assets/images/map.png')}
            resizeMode="stretch"
            style={styles.mapImage}
          />
        </View>

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          style={[styles.pickButton, loading && styles.disabled]}
          onPress={pickShift}
          disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.pickButtonText}>Pick This Shift</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f9fc' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, gap: 16 },
  card: { alignItems: 'center', gap: 14, padding: 20, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7edf3' },
  facilityIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#eaf3fb' },
  facility: { color: '#263341', fontSize: 19, fontWeight: '700', textAlign: 'center' },
  status: { color: '#067647', fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  infoRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f0f2f5' },
  infoText: { color: '#344054', fontSize: 15 },
  map: { height: 260, overflow: 'hidden', borderRadius: 16, backgroundColor: '#e7f0e5' },
  mapImage: { width: '100%', height: '100%' },
  error: { padding: 12, borderRadius: 8, color: '#b42318', backgroundColor: '#fef3f2', fontSize: 14 },
  pickButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: FORM_PRIMARY },
  pickButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
