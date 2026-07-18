import type { FieldMapping } from '../../fill-engine/types.js';
import { normalizeLabelText } from './label-utils.js';

function escapeCssIdent(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}
const FIELD_CONTAINER_SELECTOR =
  '.field, .form-field, .application-field, .application-question, [class*="Field"], [class*="question"]';

export function isPlainTextInput(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return ['text', 'email', 'tel', 'number', 'search', 'url', ''].includes(element.type);
}

/**
 * Collect hints tied to THIS control only — avoids picking up sibling field labels.
 */
export function collectFieldHints(element: Element): string[] {
  const hints: string[] = [];
  const doc = element.ownerDocument;

  const push = (value: string | null | undefined) => {
    const normalized = normalizeLabelText(value ?? '');
    if (normalized && !hints.includes(normalized)) hints.push(normalized);
  };

  push(element.getAttribute('aria-label'));
  push(element.getAttribute('placeholder'));
  push(element.getAttribute('name'));
  push(element.getAttribute('id'));

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy && doc) {
    for (const id of labelledBy.split(/\s+/)) {
      push(doc.getElementById(id)?.textContent);
    }
  }

  if (element.id && doc) {
    push(doc.querySelector(`label[for="${escapeCssIdent(element.id)}"]`)?.textContent);
  }

  const wrappingLabel = element.closest('label');
  if (wrappingLabel) push(wrappingLabel.textContent);

  const container = element.closest(FIELD_CONTAINER_SELECTOR);
  if (container) {
    const labelEl = container.querySelector(':scope > label, :scope > legend, :scope > .label');
    if (labelEl && !labelEl.contains(element)) {
      push(labelEl.textContent);
    }
  }

  return hints;
}

export function resolveDropdownContainer(element: Element): Element {
  if (element.getAttribute('role') === 'combobox') {
    return element.closest('[class*="-container"]') ?? element;
  }
  return (
    element.closest('[class*="-container"]') ??
    element.closest('.select__container') ??
    element.closest('[role="combobox"]') ??
    element
  );
}

export function inferFieldType(element: Element, mapping: FieldMapping): FieldMapping['fieldType'] {
  if (element instanceof HTMLInputElement && element.type === 'file') return 'file';
  if (element instanceof HTMLInputElement && element.type === 'checkbox') return 'checkbox';
  if (element instanceof HTMLSelectElement) return 'dropdown';
  if (element instanceof HTMLTextAreaElement) return 'textarea';

  // Plain text/email/tel inputs are NEVER dropdowns — even inside react-select pages.
  if (isPlainTextInput(element)) {
    return mapping.fieldType === 'textarea' ? 'textarea' : 'text';
  }

  if (mapping.fieldType === 'dropdown') {
    if (element.getAttribute('role') === 'combobox') return 'dropdown';
    if (element.querySelector('[role="combobox"], [class*="-control"]')) return 'dropdown';
    if (element.closest('[role="combobox"]')) return 'dropdown';
  }

  return mapping.fieldType;
}

export function setReactInputValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
