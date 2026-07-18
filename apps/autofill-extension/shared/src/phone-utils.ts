import { normalizeText } from './utils.js';

/** ISO-ish country name → dial code (most common job-application countries). */
const COUNTRY_DIAL_CODES: Record<string, string> = {
  india: '91',
  'united states': '1',
  'united kingdom': '44',
  canada: '1',
  australia: '61',
  germany: '49',
  france: '33',
  singapore: '65',
  japan: '81',
  china: '86',
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function dialCodeForCountry(country: string | null | undefined): string | undefined {
  if (!country) return undefined;
  return COUNTRY_DIAL_CODES[normalizeText(country)];
}

/**
 * Strip international dial code for forms that have a separate country-code dropdown.
 * "+91-7780150531" → "7780150531"
 */
export function stripCountryCodeFromPhone(
  phoneNumber: string,
  country?: string | null,
  explicitCountryCode?: string | null
): string {
  const trimmed = phoneNumber.trim();
  if (!trimmed) return trimmed;

  const allDigits = digitsOnly(trimmed);
  if (!allDigits) return trimmed;

  let dialCode =
    explicitCountryCode != null ? digitsOnly(String(explicitCountryCode)) : undefined;
  if (!dialCode) dialCode = dialCodeForCountry(country ?? undefined);

  if (trimmed.startsWith('+') && dialCode && allDigits.startsWith(dialCode)) {
    const local = allDigits.slice(dialCode.length);
    if (local.length >= 6) return local;
  }

  if (trimmed.startsWith('+')) {
    const withoutPlus = trimmed.replace(/^\+\d{1,3}[-.\s]?/, '');
    const localDigits = digitsOnly(withoutPlus);
    if (localDigits.length >= 6) return localDigits;
  }

  return allDigits;
}

export function formatPhoneForField(
  phoneNumber: unknown,
  candidateData: unknown
): string {
  const raw = String(phoneNumber ?? '').trim();
  if (!raw) return raw;

  const data = candidateData as Record<string, unknown> | null;
  const profile = data?.profile as Record<string, unknown> | undefined;
  const phone = profile?.phone as Record<string, unknown> | undefined;
  const address = profile?.address as Record<string, unknown> | undefined;

  return stripCountryCodeFromPhone(
    raw,
    address?.country as string | undefined,
    phone?.country_code as string | undefined
  );
}
