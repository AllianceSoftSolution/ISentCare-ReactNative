import type { ReactNode } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';

type ScreenHeaderProps = {
  title: string;
  onBack: () => void;
  backLabel?: string;
  right?: ReactNode;
};

/**
 * Full-bleed top bar. Back arrow is pinned to the physical top-left
 * (under the status-bar inset, left edge = 0).
 */
export function ScreenHeader({ title, onBack, backLabel, right }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel || 'Go back'}
          hitSlop={8}
          style={styles.backButton}
          onPress={onBack}>
          <MaterialIcons name="arrow-back" size={24} color="#344054" />
        </Pressable>

        <Text style={styles.title} numberOfLines={1} pointerEvents="none">
          {title}
        </Text>

        <View style={styles.rightSlot}>
          {right ?? <View style={styles.rightSpacer} />}
        </View>
      </View>
    </View>
  );
}

export function ScreenHeaderRefresh({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Refresh"
      hitSlop={8}
      style={styles.rightButton}
      onPress={onPress}
      disabled={disabled}>
      <MaterialIcons name="refresh" size={22} color={FORM_PRIMARY} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e7edf3',
  },
  bar: {
    height: 48,
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  title: {
    position: 'absolute',
    left: 48,
    right: 48,
    top: 0,
    bottom: 0,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    color: '#263341',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 48,
    zIndex: 1,
  },
  rightSlot: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  rightSpacer: { width: 48, height: 48 },
  rightButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
