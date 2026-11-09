import { useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { FORM_PRIMARY } from '@/components/ui/RegistrationFields';

type Point = { x: number; y: number };
export type SignatureStrokes = Point[][];

type SignaturePadProps = {
  strokes: SignatureStrokes;
  onStrokesChange: (strokes: SignatureStrokes) => void;
  onSave: (signature: string) => void;
  onClear: () => void;
};

const VIEWBOX_WIDTH = 600;
const VIEWBOX_HEIGHT = 360;
const MAX_POINTS = 6000;

function smoothStrokePath(stroke: Point[]) {
  if (!stroke.length) return '';
  if (stroke.length === 1) return `M ${stroke[0].x} ${stroke[0].y}`;
  if (stroke.length === 2) {
    return `M ${stroke[0].x} ${stroke[0].y} L ${stroke[1].x} ${stroke[1].y}`;
  }

  const commands = [`M ${stroke[0].x} ${stroke[0].y}`];
  for (let index = 1; index < stroke.length - 1; index += 1) {
    const point = stroke[index];
    const nextPoint = stroke[index + 1];
    const midpointX = (point.x + nextPoint.x) / 2;
    const midpointY = (point.y + nextPoint.y) / 2;
    commands.push(`Q ${point.x} ${point.y} ${midpointX} ${midpointY}`);
  }
  const lastPoint = stroke[stroke.length - 1];
  commands.push(`T ${lastPoint.x} ${lastPoint.y}`);
  return commands.join(' ');
}

export function SignaturePad({ strokes, onStrokesChange, onSave, onClear }: SignaturePadProps) {
  const [visible, setVisible] = useState(false);
  const [padSize, setPadSize] = useState({ width: 1, height: 1 });
  const [drawing, setDrawing] = useState(false);

  const pointFromEvent = (event: GestureResponderEvent): Point => ({
    x: Math.max(
      0,
      Math.min(
        (event.nativeEvent.locationX / padSize.width) * VIEWBOX_WIDTH,
        VIEWBOX_WIDTH,
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        (event.nativeEvent.locationY / padSize.height) * VIEWBOX_HEIGHT,
        VIEWBOX_HEIGHT,
      ),
    ),
  });

  const startStroke = (event: GestureResponderEvent) => {
    setDrawing(true);
    onStrokesChange([...strokes, [pointFromEvent(event)]]);
  };

  const extendStroke = (event: GestureResponderEvent) => {
    if (!drawing) return;
    const point = pointFromEvent(event);
    const next = [...strokes];
    const stroke = next[next.length - 1];
    if (!stroke) return;
    const previous = stroke[stroke.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) < 0.75) return;

    if (next.reduce((total, item) => total + item.length, 0) >= MAX_POINTS) return;
    next[next.length - 1] = [...stroke, point];
    onStrokesChange(next);
  };

  const saveSignature = () => {
    const paths = strokes.map(smoothStrokePath).filter(Boolean);
    if (!paths.length || !strokes.some((stroke) => stroke.length > 1)) return;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWBOX_WIDTH}" height="${VIEWBOX_HEIGHT}" viewBox="0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}"><path d="${paths.join(' ')}" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    onSave(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    setVisible(false);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strokes.length ? 'Edit signature' : 'Draw signature'}
        style={styles.openButton}
        onPress={() => setVisible(true)}>
        {strokes.length ? (
          <Svg width="100%" height={64} viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
            {strokes.map((stroke, index) => (
              <Path
                key={`preview-${index}`}
                d={smoothStrokePath(stroke)}
                fill="none"
                stroke="#000"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        ) : (
          <>
            <MaterialIcons name="draw" size={22} color={FORM_PRIMARY} />
            <Text style={styles.openButtonText}>Tap to draw your signature</Text>
          </>
        )}
      </Pressable>

      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          setDrawing(false);
          setVisible(false);
        }}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Draw your signature</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close signature pad"
              hitSlop={12}
              onPress={() => {
                setDrawing(false);
                setVisible(false);
              }}>
              <MaterialIcons name="close" size={26} color="#344054" />
            </Pressable>
          </View>
          <Text style={styles.instructions}>Use your finger or mouse to sign in the box.</Text>
          <View
            style={styles.canvas}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setPadSize({ width, height });
            }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={startStroke}
            onResponderMove={extendStroke}
            onResponderRelease={() => setDrawing(false)}
            onResponderTerminate={() => setDrawing(false)}>
            <Svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
              preserveAspectRatio="none">
              {strokes.map((stroke, index) => (
                <Path
                  key={`stroke-${index}`}
                  d={smoothStrokePath(stroke)}
                  fill="none"
                  stroke="#111827"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </Svg>
          </View>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              style={styles.clearButton}
              onPress={() => {
                setDrawing(false);
                onClear();
              }}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.saveButton, !strokes.some((stroke) => stroke.length > 1) && styles.disabled]}
              disabled={!strokes.some((stroke) => stroke.length > 1)}
              onPress={saveSignature}>
              <Text style={styles.saveButtonText}>Save Signature</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  openButton: {
    minHeight: 70,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#98a2b3',
    borderStyle: 'dashed',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  openButtonText: { color: FORM_PRIMARY, fontWeight: '600' },
  modal: {
    flex: 1,
    padding: 20,
    paddingTop: 32,
    gap: 14,
    backgroundColor: '#f7f9fc',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#202b36', fontSize: 20, fontWeight: '700' },
  instructions: { color: '#5e6875', fontSize: 14 },
  canvas: {
    flex: 1,
    minHeight: 220,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#344054',
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  clearButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: FORM_PRIMARY,
    backgroundColor: '#fff',
  },
  clearButtonText: { color: FORM_PRIMARY, fontWeight: '700' },
  saveButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 6,
    backgroundColor: FORM_PRIMARY,
  },
  saveButtonText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
