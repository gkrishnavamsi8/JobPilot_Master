import type { FieldMapping } from '../../fill-engine/types.js';
import { normalizeText } from '../../../../shared/dist/utils.js';

export function normalizeLabelText(text: string): string {
  return normalizeText(text)
    .replace(/\*/g, '')
    .replace(/\(required\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shouldRejectPhoneNumberMapping(mapping: FieldMapping, hintText: string): boolean {
  if (mapping.jsonPath !== 'profile.phone.number') return false;
  const hint = normalizeLabelText(hintText);
  if (!hint) return false;
  if (/device\s*type|phone\s*type|type\s*of\s*phone/i.test(hint)) return true;
  if (/country\s*phone\s*code|phone\s*country\s*code/i.test(hint)) return true;
  if (/country.*code|phone.*country|phone_country/i.test(hint)) return true;
  return false;
}

export function labelMatchesSynonyms(labelText: string, synonyms: string[]): boolean {
  const normalized = normalizeLabelText(labelText);
  if (!normalized) return false;
  return synonyms.some((synonym) => {
    const s = normalizeLabelText(synonym);
    return normalized === s || normalized.startsWith(s) || normalized.includes(s);
  });
}

export function findMappingByLabel(
  labelText: string,
  mappings: FieldMapping[]
): FieldMapping | undefined {
  const normalized = normalizeLabelText(labelText);
  if (!normalized) return undefined;

  let best: { mapping: FieldMapping; score: number } | undefined;

  for (const mapping of mappings) {
    if (!mapping.labelSynonyms?.length) continue;
    if (shouldRejectPhoneNumberMapping(mapping, labelText)) continue;

    for (const synonym of mapping.labelSynonyms) {
      const s = normalizeLabelText(synonym);
      if (!s) continue;

      let score = 0;
      if (normalized === s) score = 100 + s.length;
      else if (normalized.startsWith(s)) score = 60 + s.length;
      else if (normalized.includes(s)) score = 20 + s.length;

      if (score > 0 && (!best || score > best.score)) {
        best = { mapping, score };
      }
    }
  }

  return best?.mapping;
}

function matchesPattern(value: string, pattern?: string | RegExp): boolean {
  if (!pattern || !value) return false;
  if (pattern instanceof RegExp) return pattern.test(value);
  return value.toLowerCase().includes(pattern.toLowerCase());
}

export function findMappingByAttributes(
  element: Element,
  mappings: FieldMapping[]
): FieldMapping | undefined {
  const name = element.getAttribute('name') ?? '';
  const id = element.getAttribute('id') ?? '';
  const ariaLabel = element.getAttribute('aria-label') ?? '';
  const placeholder = element.getAttribute('placeholder') ?? '';
  const autocomplete = element.getAttribute('autocomplete') ?? '';

  let best: { mapping: FieldMapping; score: number } | undefined;

  for (const mapping of mappings) {
    let score = 0;
    if (matchesPattern(name, mapping.namePattern)) score += 40;
    if (matchesPattern(id, mapping.idPattern)) score += 35;
    if (matchesPattern(name, mapping.automationIdPattern)) score += 30;
    if (matchesPattern(id, mapping.automationIdPattern)) score += 25;
    if (mapping.labelSynonyms?.some((s) => matchesPattern(ariaLabel, s))) score += 25;
    if (mapping.labelSynonyms?.some((s) => matchesPattern(placeholder, s))) score += 15;
    if (matchesPattern(autocomplete, mapping.namePattern)) score += 20;

    const hintText = `${name} ${id} ${ariaLabel} ${placeholder}`;
    if (shouldRejectPhoneNumberMapping(mapping, hintText)) continue;

    // Never map phone-number field to country-phone-code dropdowns
    if (
      mapping.jsonPath === 'profile.phone.number' &&
      /country.*code|phone.*country|phone_country/i.test(hintText)
    ) {
      continue;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { mapping, score };
    }
  }

  return best?.mapping;
}

export function findBestMapping(
  hints: string[],
  mappings: FieldMapping[]
): FieldMapping | undefined {
  let best: { mapping: FieldMapping; score: number } | undefined;

  for (const hint of hints) {
    if (!hint.trim()) continue;

    const byLabel = findMappingByLabel(hint, mappings);
    if (byLabel && !shouldRejectPhoneNumberMapping(byLabel, hint)) {
      const score = 50 + hint.length;
      if (!best || score > best.score) best = { mapping: byLabel, score };
    }
  }

  return best?.mapping;
}
