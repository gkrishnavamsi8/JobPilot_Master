import type { FillHandler, FillResult, FieldMapping, FillContext } from '../types.js';

/**
 * Browsers block programmatic file input values — highlight for manual upload in v1.
 */
export const fileFillHandler: FillHandler = {
  fieldType: 'file',

  canFill(_element: Element, mapping: FieldMapping): boolean {
    return mapping.fieldType === 'file';
  },

  async fill(
    element: Element,
    _value: unknown,
    mapping: FieldMapping,
    context: FillContext
  ): Promise<FillResult> {
    const fileInput =
      element instanceof HTMLInputElement && element.type === 'file'
        ? element
        : element.querySelector('input[type="file"]');

    const target = fileInput ?? element;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('jobpilot-highlight-resume');

    context.log(`Resume upload requires manual action: ${mapping.jsonPath}`);
    return {
      success: false,
      fieldType: 'file',
      jsonPath: mapping.jsonPath,
      skipped: true,
      message: 'File upload must be done manually (browser security)',
    };
  },
};
