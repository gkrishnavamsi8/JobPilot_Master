import type { FillHandler, FillResult, FieldMapping, FillContext } from '../types.js';
import { setReactInputValue } from '../../adapters/universal/label-resolver.js';
import { formatPhoneForField } from '../../../../shared/dist/phone-utils.js';

function getInputElement(element: Element): HTMLInputElement | HTMLTextAreaElement | null {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element;
  }
  const nested = element.querySelector('input, textarea');
  if (nested instanceof HTMLInputElement || nested instanceof HTMLTextAreaElement) {
    return nested;
  }
  return null;
}

export const textFillHandler: FillHandler = {
  fieldType: 'text',

  canFill(element: Element, mapping: FieldMapping): boolean {
    return mapping.fieldType === 'text' || mapping.fieldType === 'textarea';
  },

  async fill(
    element: Element,
    value: unknown,
    mapping: FieldMapping,
    context: FillContext
  ): Promise<FillResult> {
    let strValue = String(value ?? '').trim();
    if (!strValue) {
      return {
        success: false,
        fieldType: mapping.fieldType,
        jsonPath: mapping.jsonPath,
        skipped: true,
        message: 'Empty value',
      };
    }

    if (mapping.jsonPath === 'profile.phone.number') {
      strValue = formatPhoneForField(strValue, context.candidateData);
    }

    const input = getInputElement(element);
    if (!input) {
      return {
        success: false,
        fieldType: mapping.fieldType,
        jsonPath: mapping.jsonPath,
        message: 'No text input found',
      };
    }

    input.focus();
    setReactInputValue(input, strValue);
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    context.log(`Filled text field: ${mapping.jsonPath}`, strValue);

    return {
      success: true,
      fieldType: mapping.fieldType,
      automationId: element.getAttribute('data-automation-id') ?? undefined,
      jsonPath: mapping.jsonPath,
    };
  },
};

export const textareaFillHandler: FillHandler = {
  ...textFillHandler,
  fieldType: 'textarea',
};
