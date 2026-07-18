/**
 * Resolve a dot/bracket path against candidate data.
 * Example: "profile.first_name", "education[0].school"
 */
export function getValueAtPath(data: unknown, path: string): unknown {
  if (!path) return undefined;

  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current: unknown = data;

  for (const segment of segments) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

export function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function matchesAutomationId(
  automationId: string,
  pattern: string | RegExp
): boolean {
  const normalized = automationId.toLowerCase();
  if (pattern instanceof RegExp) {
    return pattern.test(normalized);
  }
  return normalized.includes(pattern.toLowerCase());
}
