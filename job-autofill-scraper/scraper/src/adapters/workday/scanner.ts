import type { FieldMapping, ScannedField } from '../../fill-engine/types.js';
import { findMappingForAutomationId } from '../workday/mappings.js';
import { getValueAtPath, isEmptyValue } from '../../../../shared/dist/utils.js';

const FILLABLE_SELECTOR =
  'input:not([type="hidden"]):not([type="file"]), textarea, select, [contenteditable="true"], [role="combobox"], [role="textbox"], [role="checkbox"]';

/**
 * Walk the DOM for elements with data-automation-id and match against the mapping table.
 */
export function scanWorkdayFields(
  root: Document | Element,
  candidateData: unknown,
  mappings: FieldMapping[]
): ScannedField[] {
  const results: ScannedField[] = [];
  const seen = new Set<Element>();

  const nodes = root.querySelectorAll('[data-automation-id]');
  for (const node of nodes) {
    const automationId = node.getAttribute('data-automation-id');
    if (!automationId) continue;

    const mapping = findMappingForAutomationId(automationId, mappings);
    if (!mapping) continue;

    const fillTarget = findFillTarget(node, mapping.fieldType);
    if (!fillTarget || seen.has(fillTarget)) continue;

    const value = getValueAtPath(candidateData, mapping.jsonPath);
    if (isEmptyValue(value) && mapping.fieldType !== 'file' && mapping.fieldType !== 'checkbox') {
      continue;
    }

    seen.add(fillTarget);
    results.push({ element: fillTarget, automationId, mapping, value });
  }

  return results;
}

function findFillTarget(node: Element, fieldType: string): Element | null {
  if (node.matches(FILLABLE_SELECTOR)) {
    return node;
  }

  const nested = node.querySelector(FILLABLE_SELECTOR);
  if (nested) return nested;

  if (fieldType === 'checkbox' && node.getAttribute('role') === 'checkbox') {
    return node;
  }

  if (['dropdown', 'multiselect', 'repeatable', 'file'].includes(fieldType)) {
    return node;
  }

  return null;
}

/**
 * Fallback: fuzzy-match label text against mapping synonyms.
 * Secondary pass — not primary for Workday.
 */
export function scanByLabelFallback(
  root: Document | Element,
  candidateData: unknown,
  mappings: FieldMapping[],
  alreadyFilled: Set<Element>
): ScannedField[] {
  const results: ScannedField[] = [];
  const labels = root.querySelectorAll('label');

  for (const label of labels) {
    const labelText = label.textContent?.trim().toLowerCase() ?? '';
    if (!labelText) continue;

    const mapping = mappings.find((entry) =>
      entry.labelSynonyms?.some((synonym) => labelText.includes(synonym.toLowerCase()))
    );
    if (!mapping) continue;

    const target = resolveLabelTarget(label);
    if (!target || alreadyFilled.has(target)) continue;

    const value = getValueAtPath(candidateData, mapping.jsonPath);
    if (isEmptyValue(value)) continue;

    alreadyFilled.add(target);
    results.push({
      element: target,
      automationId: target.getAttribute('data-automation-id') ?? labelText,
      mapping,
      value,
    });
  }

  return results;
}

function resolveLabelTarget(label: Element): Element | null {
  const htmlFor = label.getAttribute('for');
  if (htmlFor) {
    const byId = label.ownerDocument?.getElementById(htmlFor);
    if (byId) return byId;
  }

  const nested = label.querySelector(FILLABLE_SELECTOR);
  if (nested) return nested;

  const parent = label.parentElement;
  if (parent) {
    const sibling = parent.querySelector(FILLABLE_SELECTOR);
    if (sibling) return sibling;
  }

  return null;
}
