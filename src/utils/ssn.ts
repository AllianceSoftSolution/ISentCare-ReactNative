export const SSN_DIGIT_COUNT = 9;
/** First N digits render as bullets; the rest stay visible (website onboarding: 5 masked, 4 visible). */
export const SSN_MASKED_COUNT = 5;

export function ssnDigits(value: string) {
  return String(value || '').replace(/\D/g, '').slice(0, SSN_DIGIT_COUNT);
}

/**
 * Display mask matching website onboarding: first 5 digits as bullets, last 4 as numbers,
 * with XXX-XX-XXXX dashes. Example: •••-••-1234
 */
export function formatMaskedSsn(rawDigits: string): string {
  const raw = ssnDigits(rawDigits);
  let value = `${'•'.repeat(Math.min(raw.length, SSN_MASKED_COUNT))}${raw.slice(SSN_MASKED_COUNT)}`;
  if (raw.length > 5) {
    value = `${value.slice(0, 3)}-${value.slice(3, 5)}-${value.slice(5)}`;
  } else if (raw.length > 3) {
    value = `${value.slice(0, 3)}-${value.slice(3)}`;
  }
  return value;
}

/**
 * Map a TextInput change on the masked display back to raw digits.
 * Supports typing, backspace, and paste of a full/partial SSN.
 */
export function ssnDigitsFromChange(previousDigits: string, nextDisplay: string): string {
  const previous = ssnDigits(previousDigits);
  const prevDisplay = formatMaskedSsn(previous);
  const cleanPrev = prevDisplay.replace(/-/g, '');
  const cleanNext = String(nextDisplay || '').replace(/-/g, '');
  const onlyDigits = ssnDigits(nextDisplay);

  if (onlyDigits.length === SSN_DIGIT_COUNT) {
    return onlyDigits;
  }

  if (cleanNext.length < cleanPrev.length) {
    return previous.slice(0, cleanNext.length);
  }

  if (cleanNext.length === cleanPrev.length) {
    return previous;
  }

  const addedDigits = cleanNext.slice(cleanPrev.length).replace(/\D/g, '');
  if (addedDigits) {
    return ssnDigits(`${previous}${addedDigits}`);
  }

  if (onlyDigits.length > previous.length) {
    return onlyDigits;
  }

  return previous;
}

export function isValidSsn(value: string) {
  return ssnDigits(value).length === SSN_DIGIT_COUNT;
}

export const SSN_ERROR = 'SSN must contain 9 digits.';
/** Max length of formatted masked value, e.g. •••-••-1234 */
export const SSN_INPUT_MAX_LENGTH = 11;
