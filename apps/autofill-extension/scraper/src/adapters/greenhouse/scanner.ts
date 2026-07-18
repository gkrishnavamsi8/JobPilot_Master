import type { FieldMapping, ScannedField } from '../../fill-engine/types.js';
import { getValueAtPath, isEmptyValue } from '../../../../shared/dist/utils.js';
import {
  findMappingByAttributes,
  findMappingByLabel,
  normalizeLabelText,
} from './label-utils.js';

const FILLABLE_SELECTOR =
  'input:not([type="hidden"]):not([type="file"]), textarea, select, [role="combobox"], [role="textbox"], [role="listbox"]';

const FILE_SELECTOR = 'input[type="file"]';

function findFillTarget(node: Element, fieldType: string): Element | null {
  if (fieldType === 'file') {
    if (node instanceof HTMLInputElement && node.type === 'file') return node;
    const fileInput = node.querySelector(FILE_SELECTOR);
    return fileInput ?? node;
  }

  if (node.matches(FILLABLE_SELECTOR)) return node;

  const nested = node.querySelector(FILLABLE_SELECTOR);
  if (nested) return nested;

  if (fieldType === 'dropdown') {
    const reactSelect = node.querySelector('.select__control, [role="combobox"]');
    if (reactSelect) return reactSelect.closest('.select__container') ?? reactSelect;
    return node;
  }

  if (fieldType === 'checkbox') {
    if (node instanceof HTMLInputElement && node.type === 'checkbox') return node;
    const cb = node.querySelector('input[type="checkbox"]');
    return cb ?? node;
  }

  return null;
}

function resolveLabelTarget(label: Element): Element | null {
  const htmlFor = label.getAttribute('for');
  if (htmlFor) {
    const byId = label.ownerDocument?.getElementById(htmlFor);
    if (byId) return byId;
  }

  const nested = label.querySelector(`${FILLABLE_SELECTOR}, ${FILE_SELECTOR}`);
  if (nested) return nested;

  const parent = label.parentElement;
  if (parent) {
    const sibling = parent.querySelector(`${FILLABLE_SELECTOR}, ${FILE_SELECTOR}`);
    if (sibling) return sibling;
  }

  const fieldset = label.closest('fieldset, .field, .application-field, div');
  if (fieldset) {
    const nearby = fieldset.querySelector(`${FILLABLE_SELECTOR}, ${FILE_SELECTOR}`);
    if (nearby) return nearby;
  }

  return null;
}

function pushField(
  results: ScannedField[],
  seen: Set<Element>,
  element: Element,
  mapping: FieldMapping,
  candidateData: unknown,
  key: string
): void {
  const fillTarget = findFillTarget(element, mapping.fieldType);
  if (!fillTarget || seen.has(fillTarget)) return;

  const value = getValueAtPath(candidateData, mapping.jsonPath);
  if (isEmptyValue(value) && mapping.fieldType !== 'file' && mapping.fieldType !== 'checkbox') {
    return;
  }

  seen.add(fillTarget);
  results.push({ element: fillTarget, automationId: key, mapping, value });
}

/**
 * Greenhouse scanner — labels and name/id attributes (no data-automation-id).
 */
export function scanGreenhouseFields(
  root: Document | Element,
  candidateData: unknown,
  mappings: FieldMapping[]
): ScannedField[] {
  const results: ScannedField[] = [];
  const seen = new Set<Element>();

  for (const label of root.querySelectorAll('label')) {
    const labelText = label.textContent ?? '';
    const mapping = findMappingByLabel(labelText, mappings);
    if (!mapping) continue;

    const target = resolveLabelTarget(label);
    if (!target) continue;

    pushField(results, seen, target, mapping, candidateData, normalizeLabelText(labelText));
  }

  for (const element of root.querySelectorAll(`${FILLABLE_SELECTOR}, ${FILE_SELECTOR}`)) {
    const mapping = findMappingByAttributes(element, mappings);
    if (!mapping) continue;

    const key =
      element.getAttribute('name') ??
      element.getAttribute('id') ??
      element.getAttribute('aria-label') ??
      'field';
    pushField(results, seen, element, mapping, candidateData, key);
  }

  return results;
}
