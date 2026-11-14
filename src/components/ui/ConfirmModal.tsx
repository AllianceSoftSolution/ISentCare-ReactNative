import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';

type ConfirmModalProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={busy ? undefined : onCancel}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={StyleSheet.absoluteFill}
          disabled={busy}
          onPress={onCancel}
        />
        <View style={styles.card} accessibilityRole="alert" accessibilityViewIsModal>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              style={[styles.button, styles.cancelButton, busy && styles.disabled]}
              disabled={busy}
              onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[
                styles.button,
                destructive ? styles.destructiveButton : styles.primaryButton,
                busy && styles.disabled,
              ]}
              disabled={busy}
              onPress={onConfirm}>
              <Text style={styles.confirmText}>{busy ? 'Working…' : confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    gap: 12,
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#fff',
  },
  title: {
    color: '#263341',
    fontSize: 18,
    fontWeight: '700',
  },
  message: {
    color: '#475467',
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  button: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    backgroundColor: '#fff',
  },
  cancelText: {
    color: '#344054',
    fontSize: 14,
    fontWeight: '700',
  },
  destructiveButton: {
    backgroundColor: '#d92d20',
  },
  primaryButton: {
    backgroundColor: FORM_PRIMARY,
  },
  confirmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
});
