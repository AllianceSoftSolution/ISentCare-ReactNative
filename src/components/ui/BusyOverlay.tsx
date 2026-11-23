import { FONT_FAMILY } from '@/constants/typography';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';

type BusyOverlayProps = {
  visible: boolean;
  message?: string;
};

/** Full-screen dimmed overlay with a centered loader card. */
export function BusyOverlay({ visible, message = 'Opening document…' }: BusyOverlayProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay} pointerEvents="auto">
        <View style={styles.card} accessibilityRole="progressbar" accessibilityLabel={message}>
          <ActivityIndicator size="large" color="#0b6bcb" />
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    padding: 24,
  },
  card: {
    minWidth: 160,
    maxWidth: 280,
    alignItems: 'center',
    gap: 14,
    paddingVertical: 24,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: '#ffffff',
  },
  message: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '600',
    color: '#344054',
    textAlign: 'center',
  },
});
