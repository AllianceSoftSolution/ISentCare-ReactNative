import { StyleSheet, Text, TextInput } from 'react-native';
import { FONT_FAMILY } from '@/constants/typography';

type ComponentWithDefaults = {
  defaultProps?: {
    style?: object | object[] | null;
  };
};

let applied = false;

/** Apply Poppins as the default typeface for Text and TextInput. */
export function applyAppFont() {
  if (applied) return;
  applied = true;

  const baseStyle = StyleSheet.create({
    font: { fontFamily: FONT_FAMILY },
  }).font;

  const textComponent = Text as unknown as ComponentWithDefaults;
  textComponent.defaultProps = {
    ...textComponent.defaultProps,
    style: [baseStyle, textComponent.defaultProps?.style],
  };

  const inputComponent = TextInput as unknown as ComponentWithDefaults;
  inputComponent.defaultProps = {
    ...inputComponent.defaultProps,
    style: [baseStyle, inputComponent.defaultProps?.style],
  };
}
