import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

type SuccessTickModalProps = {
  visible: boolean;
  title?: string;
  message?: string;
  durationMs?: number;
  onDone: () => void;
};

export function SuccessTickModal({
  visible,
  title = 'Apply Successfully',
  message = 'Your shift application was submitted.',
  durationMs = 2200,
  onDone,
}: SuccessTickModalProps) {
  const [scale] = useState(() => new Animated.Value(0.4));
  const [opacity] = useState(() => new Animated.Value(0));
  const [checkScale] = useState(() => new Animated.Value(0));
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!visible) {
      animationRef.current?.stop();
      animationRef.current = null;
      return;
    }

    scale.setValue(0.4);
    opacity.setValue(0);
    checkScale.setValue(0);

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: true,
        }),
      ]),
      Animated.spring(checkScale, {
        toValue: 1,
        friction: 4,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.delay(Math.max(durationMs - 500, 600)),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    animationRef.current = animation;
    animation.start(({ finished }) => {
      animationRef.current = null;
      if (finished) onDoneRef.current();
    });

    return () => {
      animation.stop();
      animationRef.current = null;
    };
  }, [visible, durationMs, scale, opacity, checkScale]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
          <View style={styles.circle}>
            <Animated.View style={{ transform: [{ scale: checkScale }] }}>
              <MaterialIcons name="check" size={48} color="#fff" />
            </Animated.View>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    gap: 12,
    paddingVertical: 28,
    paddingHorizontal: 22,
    borderRadius: 20,
    backgroundColor: '#fff',
  },
  circle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#12b76a',
    marginBottom: 4,
  },
  title: {
    color: '#101828',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    color: '#667085',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
