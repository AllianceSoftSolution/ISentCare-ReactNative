import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type SkeletonProps = {
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Skeleton({ style, accessibilityLabel = 'Loading content' }: SkeletonProps) {
  const [opacity] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={[styles.block, style, { opacity }]}
    />
  );
}

export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <View accessibilityLabel="Loading content" accessibilityRole="progressbar" style={styles.lines}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} style={{ width: index === count - 1 ? '58%' : '100%', height: 13 }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { height: 16, borderRadius: 8, backgroundColor: '#d9e2ec' },
  lines: { gap: 10 },
});
