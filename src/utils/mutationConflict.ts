function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && Number.isFinite(status) ? status : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || '');
}

/**
 * Detect server conflicts where a cached list item is no longer actionable
 * (removed, filled, already applied, closed, etc.).
 */
export function isMutationConflictError(error: unknown): boolean {
  const status = errorStatus(error);
  if (status === 404 || status === 409 || status === 410) return true;

  const normalized = errorMessage(error).toLowerCase();
  if (!normalized.trim()) return false;

  const patterns = [
    'no longer available',
    'not available',
    'not found',
    'does not exist',
    'already applied',
    'already submitted',
    'already punched',
    'already started',
    'already completed',
    'already ended',
    'closed',
    'filled',
    'taken',
    'removed',
    'cancelled',
    'canceled',
    'inactive',
    'expired',
    'not approved',
    'unapproved',
    'cannot apply',
    'unable to apply',
    'invalid job',
    'invalid shift',
    'must be at the facility',
    'geofence',
    '40 hours',
    'different facilities',
    'same week',
  ];

  return patterns.some((pattern) => normalized.includes(pattern));
}

/**
 * Whether a conflict means the card should disappear from a work list.
 * Location / geofence / already-started punch failures keep the row visible.
 */
export function shouldDropStaleWorkItem(error: unknown): boolean {
  if (!isMutationConflictError(error)) return false;

  const status = errorStatus(error);
  if (status === 404 || status === 410) return true;

  const normalized = errorMessage(error).toLowerCase();
  const keepVisible = [
    'must be at the facility',
    'geofence',
    'location',
    'already punched',
    'already started',
    'already ended',
    'already completed',
    'wrong day',
    'not approved',
    'unapproved',
    '40 hours',
    'different facilities',
    'same week',
  ];
  if (keepVisible.some((pattern) => normalized.includes(pattern))) return false;

  return [
    'no longer available',
    'not available',
    'not found',
    'does not exist',
    'already applied',
    'already submitted',
    'closed',
    'filled',
    'taken',
    'removed',
    'cancelled',
    'canceled',
    'inactive',
    'expired',
    'cannot apply',
    'unable to apply',
    'invalid job',
    'invalid shift',
  ].some((pattern) => normalized.includes(pattern));
}

export function mutationConflictMessage(error: unknown, fallback: string) {
  const message = errorMessage(error).trim();
  if (message) return message;
  return fallback;
}
