import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import type { EarningsMonth } from '@/api/notifications';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';

type EarningsChartProps = {
  months: EarningsMonth[];
  height?: number;
};

export function EarningsChart({ months, height = 210 }: EarningsChartProps) {
  const width = 340;
  const padding = { top: 18, right: 12, bottom: 28, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = months.map((item) => item.pay);
  const maxValue = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = padding.left + (months.length <= 1 ? chartWidth / 2 : (index / (months.length - 1)) * chartWidth);
    const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
    return { x, y, value, label: months[index]?.label ?? '' };
  });

  if (!points.length) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>No earnings data for this year.</Text>
      </View>
    );
  }

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: padding.top + chartHeight * (1 - ratio),
    label: `$${Math.round(maxValue * ratio)}`,
  }));

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id="earningsFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={FORM_PRIMARY} stopOpacity="0.28" />
            <Stop offset="100%" stopColor={FORM_PRIMARY} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        {yTicks.map((tick) => (
          <SvgLine
            key={tick.label}
            x1={padding.left}
            y1={tick.y}
            x2={width - padding.right}
            y2={tick.y}
            stroke="#e7edf3"
            strokeWidth="1"
          />
        ))}
        {yTicks.map((tick) => (
          <SvgText
            key={`label-${tick.label}`}
            x={padding.left - 8}
            y={tick.y + 4}
            fontSize="10"
            fill="#667085"
            textAnchor="end">
            {tick.label}
          </SvgText>
        ))}
        <Path d={areaPath} fill="url(#earningsFill)" />
        <Path d={linePath} stroke={FORM_PRIMARY} strokeWidth="2.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point) => (
          <Circle key={`${point.label}-${point.x}`} cx={point.x} cy={point.y} r="3.5" fill="#fff" stroke={FORM_PRIMARY} strokeWidth="2" />
        ))}
        {points.filter((_, index) => index % 2 === 0 || index === points.length - 1).map((point) => (
          <SvgText
            key={`month-${point.label}`}
            x={point.x}
            y={height - 8}
            fontSize="10"
            fill="#667085"
            textAnchor="middle">
            {point.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden' },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#667085', fontSize: 14 },
});
