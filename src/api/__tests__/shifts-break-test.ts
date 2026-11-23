import { isBreakDeductionEligible } from '@/api/shifts';

describe('isBreakDeductionEligible', () => {
  const now = Date.parse('2026-11-21T18:00:00.000Z');

  test('fails closed when punch-in time is unknown', () => {
    expect(isBreakDeductionEligible({ punch_in: null }, null, now)).toBe(false);
    expect(isBreakDeductionEligible({ punch_in: undefined }, undefined, now)).toBe(false);
    expect(isBreakDeductionEligible({ punch_in: 'not-a-date' }, null, now)).toBe(false);
  });

  test('uses server punch_in when present', () => {
    expect(
      isBreakDeductionEligible({ punch_in: '2026-11-21T17:00:00.000Z' }, null, now),
    ).toBe(true);
    expect(
      isBreakDeductionEligible({ punch_in: '2026-11-21T17:45:00.000Z' }, null, now),
    ).toBe(false);
  });

  test('falls back to local punch-in timestamp', () => {
    expect(isBreakDeductionEligible({ punch_in: null }, now - 30 * 60 * 1000, now)).toBe(true);
    expect(isBreakDeductionEligible({ punch_in: null }, now - 10 * 60 * 1000, now)).toBe(false);
  });
});
