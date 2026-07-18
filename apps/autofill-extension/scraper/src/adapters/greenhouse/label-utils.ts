import type { FieldMapping } from '../../fill-engine/types.js';
import { normalizeText } from '../../../../shared/dist/utils.js';

export function normalizeLabelText(text: string): string {
  return normalizeText(text)
    .replace(/\*/g, '')
    .replace(/\(required\)/g, '')
    .trim();
}

export function labelMatchesSynonyms(labelText: string, synonyms: string[]): boolean {
  const normalized = normalizeLabelText(labelText);
  return synonyms.some((synonym) => {
    const s = normalizeLabelText(synonym);
    return normalized === s || normalized.startsWith(s) || normalized.includes(s);
  });
}

export function findMappingByLabel(
  labelText: string,
  mappings: FieldMapping[]
): FieldMapping | undefined {
  let best: { mapping: FieldMapping; score: number } | undefined;

  for (const mapping of mappings) {
    if (!mapping.labelSynonyms?.length) continue;
    if (!labelMatchesSynonyms(labelText, mapping.labelSynonyms)) continue;

    let score = 10;
    for (const synonym of mapping.labelSynonyms) {
      const s = normalizeLabelText(synonym);
      const n = normalizeLabelText(labelText);
      if (n === s) score += 50;
      else if (n.startsWith(s)) score += 20;
      else score += s.length;
    }

    if (!best || score > best.score) {
      best = { mapping, score };
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

  let best: { mapping: FieldMapping; score: number } | undefined;

  for (const mapping of mappings) {
    let score = 0;
    if (matchesPattern(name, mapping.namePattern)) score += 40;
    if (matchesPattern(id, mapping.idPattern)) score += 35;
    if (matchesPattern(name, mapping.automationIdPattern)) score += 30;
    if (matchesPattern(id, mapping.automationIdPattern)) score += 25;
    if (mapping.labelSynonyms?.some((s) => matchesPattern(ariaLabel, s))) score += 20;
    if (mapping.labelSynonyms?.some((s) => matchesPattern(placeholder, s))) score += 15;

    if (score > 0 && (!best || score > best.score)) {
      best = { mapping, score };
    }
  }

  return best?.mapping;
}
