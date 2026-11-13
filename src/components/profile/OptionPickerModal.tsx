import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';
import { Spacing } from '@/constants/theme';

export type PickerOption = { id: number; name: string };

type OptionPickerModalProps = {
  visible: boolean;
  title: string;
  options: PickerOption[];
  onClose: () => void;
  onSelect: (option: PickerOption) => void;
  selectedIds?: number[];
  multi?: boolean;
};

export function OptionPickerModal({
  visible,
  title,
  options,
  onClose,
  onSelect,
  selectedIds,
  multi = false,
}: OptionPickerModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <ScrollView style={styles.list}>
            {options.map((option) => {
              const selected = selectedIds?.includes(option.id) ?? false;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  style={styles.row}
                  onPress={() => onSelect(option)}>
                  <Text style={styles.rowText}>{option.name}</Text>
                  {multi ? (
                    <MaterialIcons
                      name={selected ? 'check-box' : 'check-box-outline-blank'}
                      size={21}
                      color={FORM_PRIMARY}
                    />
                  ) : selected ? (
                    <MaterialIcons name="check" size={21} color={FORM_PRIMARY} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable accessibilityRole="button" style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>{multi ? 'Done' : 'Close'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  content: {
    maxHeight: '70%',
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#fff',
  },
  title: { color: '#263341', fontSize: 17, fontWeight: '700' },
  list: { maxHeight: 360 },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e7edf3',
  },
  rowText: { flex: 1, color: '#344054', fontSize: 15 },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    backgroundColor: FORM_PRIMARY,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
