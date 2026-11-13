/** US account/contact phones are validated as exactly 10 digits (backend registration rule). */
export const US_PHONE_DIGIT_COUNT = 10;
/** Formatted length of `(XXX) XXX-XXXX`. */
export const US_PHONE_INPUT_MAX_LENGTH = 14;

export function phoneDigits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Live input formatting: (555) 123-4567
 * Keep digits-only in state; pass digits into this for display.
 */
export function formatPhoneNumber(value: string, maxDigits = US_PHONE_DIGIT_COUNT): string {
  const digits = phoneDigits(value).slice(0, maxDigits);
  const len = digits.length;
  if (len === 0) return '';
  if (len < 4) return `(${digits}`;
  if (len < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function normalizePhoneInput(value: string, maxDigits = US_PHONE_DIGIT_COUNT) {
  return phoneDigits(value).slice(0, maxDigits);
}

export function isValidUsPhone(value: string) {
  return phoneDigits(value).length === US_PHONE_DIGIT_COUNT;
}

export const US_PHONE_ERROR = 'Enter a valid 10-digit phone number.';
