import type { FillHandler, FillResult, FieldMapping, FillContext } from '../types.js';

export const checkboxFillHandler: FillHandler = {
  fieldType: 'checkbox',

  canFill(_element: Element, mapping: FieldMapping): boolean {
    return mapping.fieldType === 'checkbox';
  },

  async fill(
    element: Element,
    value: unknown,
    mapping: FieldMapping,
    context: FillContext
  ): Promise<FillResult> {
    const shouldCheck = Boolean(value);
    const input =
      element instanceof HTMLInputElement && element.type === 'checkbox'
        ? element
        : element.querySelector('input[type="checkbox"]');

    if (input instanceof HTMLInputElement) {
      if (input.checked !== shouldCheck) {
        input.click();
      }
      context.log(`Set checkbox: ${mapping.jsonPath}`, shouldCheck);
      return {
        success: true,
        fieldType: 'checkbox',
        jsonPath: mapping.jsonPath,
      };
    }

    if (element.getAttribute('role') === 'checkbox') {
      const isChecked = element.getAttribute('aria-checked') === 'true';
      if (isChecked !== shouldCheck) {
        (element as HTMLElement).click();
      }
      return {
        success: true,
        fieldType: 'checkbox',
        jsonPath: mapping.jsonPath,
      };
    }

    return {
      success: false,
      fieldType: 'checkbox',
      jsonPath: mapping.jsonPath,
      message: 'Checkbox element not found',
    };
  },
};
