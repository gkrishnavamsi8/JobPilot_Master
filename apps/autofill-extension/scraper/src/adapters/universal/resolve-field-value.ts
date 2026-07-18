import type { FieldMapping } from '../../fill-engine/types.js';
import { formatPhoneForField } from '../../../../shared/dist/phone-utils.js';
import { getValueAtPath } from '../../../../shared/dist/utils.js';

function isCountryPhoneCodeMapping(mapping: FieldMapping): boolean {
  return mapping.labelSynonyms?.some((synonym) =>
    /country phone code|phone country code/i.test(synonym),
  ) ?? false;
}

function isPhoneDeviceTypeMapping(mapping: FieldMapping): boolean {
  return mapping.jsonPath === 'profile.phone.type';
}

function extractDialCodeFromPhoneNumber(phoneNumber: string): string | undefined {
  const trimmed = phoneNumber.trim();
  if (!trimmed.startsWith('+')) return undefined;
  const match = trimmed.match(/^\+(\d{1,3})/);
  return match?.[1];
}

function getCountryPhoneCodeSearchTerms(candidateData: unknown): string[] {
  const profile = (candidateData as Record<string, unknown> | null)?.profile as
    | Record<string, unknown>
    | undefined;
  const address = profile?.address as Record<string, unknown> | undefined;
  const phone = profile?.phone as Record<string, unknown> | undefined;
  const country = String(address?.country ?? '').trim();
  const phoneNumber = String(phone?.number ?? '').trim();
  const explicitCode = String(phone?.country_code ?? '').trim();

  const terms: string[] = [];
  if (country) terms.push(country);

  const dialCode =
    (explicitCode ? explicitCode.replace(/\D/g, '') : undefined)
    ?? extractDialCodeFromPhoneNumber(phoneNumber);

  if (dialCode) {
    terms.push(`+${dialCode}`);
    terms.push(`(${dialCode})`);
  }

  return [...new Set(terms.filter(Boolean))];
}

function normalizePhoneTypeValue(value: unknown): string {
  const raw = String(value ?? 'mobile').trim().toLowerCase();
  if (!raw) return 'Mobile';
  if (raw === 'mobile' || raw === 'cell' || raw === 'cellphone') return 'Mobile';
  if (raw === 'home') return 'Home';
  if (raw === 'work' || raw === 'office') return 'Work';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function resolveFieldValue(mapping: FieldMapping, candidateData: unknown): unknown {
  const raw = getValueAtPath(candidateData, mapping.jsonPath);

  if (mapping.jsonPath === 'profile.phone.number') {
    return formatPhoneForField(raw, candidateData);
  }

  if (isPhoneDeviceTypeMapping(mapping)) {
    return normalizePhoneTypeValue(raw);
  }

  if (isCountryPhoneCodeMapping(mapping)) {
    const terms = getCountryPhoneCodeSearchTerms(candidateData);
    return terms[0] ?? raw;
  }

  return raw;
}

export function getDropdownSearchTerms(
  mapping: FieldMapping,
  candidateData: unknown,
  primaryValue: unknown,
): string[] {
  const primary = String(primaryValue ?? '').trim();
  const terms = primary ? [primary] : [];

  if (isCountryPhoneCodeMapping(mapping)) {
    for (const term of getCountryPhoneCodeSearchTerms(candidateData)) {
      if (!terms.includes(term)) terms.push(term);
    }
  }

  if (mapping.jsonPath === 'profile.address.country' && !isCountryPhoneCodeMapping(mapping)) {
    const normalized = primary.toLowerCase();
    if (normalized === 'united states' || normalized === 'usa' || normalized === 'us') {
      terms.push('United States of America', 'United States', 'USA');
    }
    if (normalized === 'india') {
      terms.push('India');
    }
    if (normalized === 'united kingdom' || normalized === 'uk') {
      terms.push('United Kingdom', 'UK');
    }
  }

  if (isPhoneDeviceTypeMapping(mapping)) {
    const normalized = normalizePhoneTypeValue(primary);
    terms.push(normalized, `${normalized} Phone`, normalized.toLowerCase());
  }

  return [...new Set(terms.filter(Boolean))];
}
