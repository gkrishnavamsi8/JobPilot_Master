import type { FieldMapping, ScannedField } from '../../fill-engine/types.js';
import { getValueAtPath, isEmptyValue, matchesAutomationId } from '../../../../shared/dist/utils.js';
import {
  findBestMapping,
  findMappingByAttributes,
  findMappingByLabel,
  normalizeLabelText,
  shouldRejectPhoneNumberMapping,
} from './label-utils.js';
import {
  collectFieldHints,
  inferFieldType,
  isPlainTextInput,
  resolveDropdownContainer,
} from './label-resolver.js';
import { UNIVERSAL_FIELD_MAPPINGS } from './mappings.js';
import { resolveFieldValue } from './resolve-field-value.js';

const INPUT_SELECTOR =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select';
const FILE_SELECTOR = 'input[type="file"]';

function isVisible(element: Element): boolean {
  if (element instanceof HTMLInputElement && element.type === 'hidden') return false;
  if (!(element instanceof HTMLElement)) return true;
  const style = element.ownerDocument?.defaultView?.getComputedStyle(element);
  if (style?.display === 'none' || style?.visibility === 'hidden') return false;
  return true;
}

function resolveFillElement(element: Element, fieldType: FieldMapping['fieldType']): Element | null {
  if (fieldType === 'file') {
    if (element instanceof HTMLInputElement && element.type === 'file') return element;
    return element.querySelector(FILE_SELECTOR);
  }

  if (fieldType === 'dropdown') {
    if (isPlainTextInput(element)) return null;
    if (element instanceof HTMLSelectElement) return element;
    if (element.getAttribute('role') === 'combobox') return resolveDropdownContainer(element);
    const combo = element.closest('[role="combobox"]');
    if (combo) return resolveDropdownContainer(combo);
    const container = element.closest('[class*="-container"], .select__container');
    if (container && !container.querySelector('input[type="text"]#first_name, input[id="first_name"]')) {
      return container;
    }
    return element.getAttribute('role') === 'combobox' ? element : null;
  }

  if (fieldType === 'checkbox') {
    if (element instanceof HTMLInputElement && element.type === 'checkbox') return element;
    return element.querySelector('input[type="checkbox"]') ?? element;
  }

  if (element.matches(INPUT_SELECTOR)) return element;
  return element.querySelector(INPUT_SELECTOR);
}

function addScannedField(
  results: ScannedField[],
  seen: Set<Element>,
  element: Element,
  mapping: FieldMapping,
  candidateData: unknown,
  key: string
): void {
  const fieldType = inferFieldType(element, mapping);
  const resolvedMapping = { ...mapping, fieldType };
  const target = resolveFillElement(element, fieldType);
  if (!target || seen.has(target)) return;

  const value = resolveFieldValue(resolvedMapping, candidateData);
  if (isEmptyValue(value) && fieldType !== 'file' && fieldType !== 'checkbox') return;

  seen.add(target);
  results.push({ element: target, automationId: key, mapping: resolvedMapping, value });
}

function matchLabelAssociations(
  root: Document | Element,
  candidateData: unknown,
  mappings: FieldMapping[],
  seen: Set<Element>,
  results: ScannedField[]
): void {
  const doc =
    'nodeType' in root && root.nodeType === 9
      ? (root as Document)
      : (root as Element).ownerDocument;
  if (!doc) return;

  for (const label of root.querySelectorAll('label[for]')) {
    const forId = label.getAttribute('for');
    if (!forId) continue;
    const target = doc.getElementById(forId);
    if (!target || !isVisible(target)) continue;

    const mapping = findMappingByLabel(label.textContent ?? '', mappings);
    if (!mapping) continue;

    addScannedField(
      results,
      seen,
      target,
      mapping,
      candidateData,
      normalizeLabelText(label.textContent ?? forId)
    );
  }
}

function matchElement(
  element: Element,
  candidateData: unknown,
  mappings: FieldMapping[],
  seen: Set<Element>,
  results: ScannedField[]
): void {
  if (!isVisible(element)) return;

  const hints = collectFieldHints(element);
  const mapping =
    findMappingByAttributes(element, mappings) ?? findBestMapping(hints, mappings);
  if (!mapping) return;
  if (hints.some((hint) => shouldRejectPhoneNumberMapping(mapping, hint))) return;

  addScannedField(
    results,
    seen,
    element,
    mapping,
    candidateData,
    hints[0] || element.getAttribute('name') || element.getAttribute('id') || 'field'
  );
}

function matchComboboxes(
  root: Document | Element,
  candidateData: unknown,
  mappings: FieldMapping[],
  seen: Set<Element>,
  results: ScannedField[]
): void {
  for (const combo of root.querySelectorAll('[role="combobox"]')) {
    if (seen.has(combo)) continue;

    const hints = collectFieldHints(combo);
    const mapping = findBestMapping(hints, mappings) ?? findMappingByAttributes(combo, mappings);
    if (!mapping || mapping.fieldType !== 'dropdown') continue;

    addScannedField(results, seen, combo, mapping, candidateData, hints[0] || 'combobox');
  }
}

/**
 * Universal scanner — reads labels, names, ids, aria attributes on any job board.
 */
export function scanUniversalFields(
  root: Document | Element,
  candidateData: unknown,
  mappings: FieldMapping[] = UNIVERSAL_FIELD_MAPPINGS
): ScannedField[] {
  const results: ScannedField[] = [];
  const seen = new Set<Element>();

  for (const node of root.querySelectorAll('[data-automation-id]')) {
    const automationId = node.getAttribute('data-automation-id');
    if (!automationId) continue;

    let best: FieldMapping | undefined;
    let bestScore = 0;
    for (const mapping of mappings) {
      if (!mapping.automationIdPattern) continue;
      if (!matchesAutomationId(automationId, mapping.automationIdPattern)) continue;
      const score = 20 + String(mapping.automationIdPattern).length;
      if (score > bestScore) {
        best = mapping;
        bestScore = score;
      }
    }
    if (best) {
      addScannedField(results, seen, node, best, candidateData, automationId);
    }
  }

  matchLabelAssociations(root, candidateData, mappings, seen, results);

  for (const element of root.querySelectorAll(INPUT_SELECTOR)) {
    matchElement(element, candidateData, mappings, seen, results);
  }

  for (const element of root.querySelectorAll(FILE_SELECTOR)) {
    matchElement(element, candidateData, mappings, seen, results);
  }

  matchComboboxes(root, candidateData, mappings, seen, results);

  return results;
}

export { UNIVERSAL_FIELD_MAPPINGS };
