import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import { Spacing } from '@/constants/theme';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

type FieldColors = {
  backgroundColor: string;
  textColor: string;
};

type IconTextInputProps = FieldColors & {
  icon: IconName;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: ComponentProps<typeof TextInput>['keyboardType'];
  secureTextEntry?: boolean;
  autoCapitalize?: ComponentProps<typeof TextInput>['autoCapitalize'];
  autoComplete?: ComponentProps<typeof TextInput>['autoComplete'];
  editable?: boolean;
  multiline?: boolean;
  maxLength?: number;
};

export function IconTextInput({
  icon,
  placeholder,
  value,
  onChangeText,
  backgroundColor,
  textColor,
  secureTextEntry = false,
  ...inputProps
}: IconTextInputProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <View style={[styles.field, { backgroundColor }]}>
      <MaterialIcons name={icon} size={20} color="#6b7280" />
      <TextInput
        style={[styles.textInput, { color: textColor }, inputProps.multiline && styles.multiline]}
        placeholder={placeholder}
        placeholderTextColor="#7b8490"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry && !passwordVisible}
        {...inputProps}
      />
      {secureTextEntry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
          accessibilityState={{ checked: passwordVisible, disabled: inputProps.editable === false }}
          disabled={inputProps.editable === false}
          hitSlop={8}
          onPress={() => setPasswordVisible((visible) => !visible)}>
          <MaterialIcons
            name={passwordVisible ? 'visibility' : 'visibility-off'}
            size={20}
            color="#6b7280"
          />
        </Pressable>
      ) : null}
    </View>
  );
}

type DateFieldProps = FieldColors & {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  editable?: boolean;
  maximumDate?: Date;
  minimumDate?: Date;
};

export function normalizeApiDate(value: string): string | null {
  const date = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;

  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return date;
}

export function IconDateField({
  placeholder,
  value,
  onChange,
  editable = true,
  backgroundColor,
  textColor,
  maximumDate,
  minimumDate,
}: DateFieldProps) {
  const [visible, setVisible] = useState(false);
  const pickerValue = value ? new Date(`${value}T12:00:00`) : new Date();

  if (Platform.OS === 'web') {
    const dateInputProps = { type: 'date' } as ComponentProps<typeof TextInput> & {
      type: 'date';
    };
    return (
      <View style={[styles.field, { backgroundColor }]}>
        <MaterialIcons name="calendar-today" size={20} color="#6b7280" />
        <TextInput
          {...dateInputProps}
          style={[styles.textInput, { color: textColor }]}
          value={value}
          onChangeText={onChange}
          editable={editable}
          placeholder={placeholder}
          accessibilityLabel={placeholder}
        />
      </View>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={placeholder}
        accessibilityState={{ disabled: !editable }}
        style={[styles.field, { backgroundColor }]}
        onPress={() => setVisible(true)}
        disabled={!editable}>
        <MaterialIcons name="calendar-today" size={20} color="#6b7280" />
        <Text style={[styles.dateText, { color: value ? textColor : '#7b8490' }]}>
          {value || placeholder}
        </Text>
      </Pressable>
      {visible ? (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          display="default"
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onChange={(_, date) => {
            setVisible(false);
            if (date) {
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              onChange(`${year}-${month}-${day}`);
            }
          }}
        />
      ) : null}
    </>
  );
}

type RegistrationStepperProps = {
  activeStep: 1 | 2 | 3;
};

const STEPS = ['Job Type', 'Personal Information', 'Employment'];

export function RegistrationStepper({ activeStep }: RegistrationStepperProps) {
  return (
    <View style={styles.stepper} accessibilityRole="progressbar" accessibilityValue={{ now: activeStep, min: 1, max: 3 }}>
      {STEPS.map((label, index) => {
        const stepNumber = index + 1;
        const active = stepNumber === activeStep;
        const complete = stepNumber < activeStep;
        return (
          <View key={label} style={[styles.step, (active || complete) && styles.stepActive]}>
            <Text style={[styles.stepLabel, (active || complete) && styles.stepLabelActive]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export const FORM_PRIMARY = '#1d66a5';

const styles = StyleSheet.create({
  field: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: '#d8e0e8',
  },
  textInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    paddingVertical: Spacing.two,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  dateText: { flex: 1, fontSize: 15, paddingVertical: Spacing.two },
  stepper: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginBottom: Spacing.three,
  },
  step: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#d8e0e8',
    paddingHorizontal: 2,
  },
  stepActive: { borderBottomColor: FORM_PRIMARY },
  stepLabel: { color: '#667085', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  stepLabelActive: { color: FORM_PRIMARY },
});
