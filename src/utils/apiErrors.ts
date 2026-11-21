/** True when a response body looks like an HTML page, not a JSON API error. */
export function looksLikeHtml(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim().slice(0, 200).toLowerCase();
  return (
    trimmed.startsWith('<!doctype html')
    || trimmed.startsWith('<html')
    || trimmed.includes('<head>')
    || trimmed.includes('<body')
  );
}

export function isAuthFailureStatus(status?: number | null): boolean {
  return status === 401 || status === 403;
}
