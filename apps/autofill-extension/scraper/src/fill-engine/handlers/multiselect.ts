import type { FillHandler, FillResult, FieldMapping, FillContext } from '../types.js';
import {
  dispatchMouseClick,
  findMultiselectInput,
  normalizeMatchText,
  setNativeInputValue,
  sleep,
  textMatchesOption,
  waitForVisibleOptions,
} from '../dom-utils.js';

async function addMultiselectTag(
  container: Element,
  tag: string,
  context: FillContext
): Promise<boolean> {
  const input = findMultiselectInput(container);
  if (!input) return false;

  setNativeInputValue(input, tag);
  await sleep(200);

  const searchRoot = container.ownerDocument?.body ?? container;
  const options = await waitForVisibleOptions(searchRoot);
  const match = options.find((opt) => textMatchesOption(opt.textContent ?? '', tag));

  if (match) {
    dispatchMouseClick(match);
    await sleep(150);
    context.log('Multiselect suggestion selected', tag);
    return true;
  }

  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  );
  input.dispatchEvent(
    new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true })
  );
  await sleep(150);
  context.log('Multiselect Enter fallback', tag);
  return true;
}

export const multiselectFillHandler: FillHandler = {
  fieldType: 'multiselect',

  canFill(_element: Element, mapping: FieldMapping): boolean {
    return mapping.fieldType === 'multiselect';
  },

  async fill(
    element: Element,
    value: unknown,
    mapping: FieldMapping,
    context: FillContext
  ): Promise<FillResult> {
    const items = Array.isArray(value) ? value.map(String) : [];
    if (items.length === 0) {
      return {
        success: false,
        fieldType: 'multiselect',
        jsonPath: mapping.jsonPath,
        skipped: true,
        message: 'No items to add',
      };
    }

    let added = 0;
    for (const item of items) {
      const trimmed = item.trim();
      if (!trimmed) continue;

      const existingTags = Array.from(
        element.querySelectorAll('[data-tag], .tag, .pill, [role="option"][aria-selected="true"]')
      ).map((el) => normalizeMatchText(el.textContent ?? ''));

      if (existingTags.some((tag) => textMatchesOption(tag, trimmed))) {
        added += 1;
        continue;
      }

      const ok = await addMultiselectTag(element, trimmed, context);
      if (ok) added += 1;
    }

    if (added === 0) {
      return {
        success: false,
        fieldType: 'multiselect',
        jsonPath: mapping.jsonPath,
        message: 'Could not add multiselect items',
      };
    }

    return {
      success: true,
      fieldType: 'multiselect',
      jsonPath: mapping.jsonPath,
      automationId: element.getAttribute('data-automation-id') ?? undefined,
      message: `Added ${added}/${items.length} items`,
    };
  },
};
