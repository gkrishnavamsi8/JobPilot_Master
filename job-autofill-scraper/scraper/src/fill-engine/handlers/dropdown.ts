import type { FillHandler, FillResult, FieldMapping, FillContext } from '../types.js';
import {
  dispatchMouseClick,
  findBestMatchingOption,
  findDropdownTrigger,
  normalizeMatchText,
  sleep,
  textMatchesOption,
  waitForVisibleOptions,
} from '../dom-utils.js';

async function fillNativeSelect(
  select: HTMLSelectElement,
  value: string,
  mapping: FieldMapping,
  context: FillContext
): Promise<FillResult> {
  const desired = normalizeMatchText(value);
  const optionElements = Array.from(select.options);
  let matched: HTMLOptionElement | undefined;

  const matchedEl = findBestMatchingOption(optionElements, desired);
  if (matchedEl instanceof HTMLOptionElement) matched = matchedEl;

  if (!matched) {
    for (const option of optionElements) {
      if (normalizeMatchText(option.value) === desired) {
        matched = option;
        break;
      }
    }
  }

  if (!matched) {
    return {
      success: false,
      fieldType: 'dropdown',
      jsonPath: mapping.jsonPath,
      message: `No option matching "${value}"`,
    };
  }

  select.value = matched.value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
  context.log(`Filled native select: ${mapping.jsonPath}`, matched.textContent);
  return {
    success: true,
    fieldType: 'dropdown',
    jsonPath: mapping.jsonPath,
    automationId: select.getAttribute('data-automation-id') ?? undefined,
  };
}

async function fillReactSelect(
  container: Element,
  value: string,
  mapping: FieldMapping,
  context: FillContext
): Promise<FillResult> {
  const control = findDropdownTrigger(container);
  if (!control) {
    return {
      success: false,
      fieldType: 'dropdown',
      jsonPath: mapping.jsonPath,
      message: 'React-select control not found',
    };
  }

  dispatchMouseClick(control);
  await sleep(250);

  const input =
    container.querySelector('input[type="text"], input:not([type="hidden"])') ??
    container.ownerDocument?.activeElement;
  if (input instanceof HTMLInputElement) {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(400);
  }

  const searchRoot = container.ownerDocument?.body ?? container;
  const options = await waitForVisibleOptions(searchRoot);
  const match = findBestMatchingOption(options, value);
  if (!match) {
    return {
      success: false,
      fieldType: 'dropdown',
      jsonPath: mapping.jsonPath,
      message: `No react-select option matching "${value}"`,
    };
  }

  dispatchMouseClick(match);
  await sleep(100);
  context.log(`Filled react-select: ${mapping.jsonPath}`, value);

  return {
    success: true,
    fieldType: 'dropdown',
    jsonPath: mapping.jsonPath,
    automationId: container.getAttribute('id') ?? undefined,
  };
}

async function fillCustomDropdown(
  container: Element,
  value: string,
  mapping: FieldMapping,
  context: FillContext
): Promise<FillResult> {
  const trigger = findDropdownTrigger(container);
  if (!trigger) {
    return {
      success: false,
      fieldType: 'dropdown',
      jsonPath: mapping.jsonPath,
      message: 'Dropdown trigger not found',
    };
  }

  dispatchMouseClick(trigger);
  await sleep(150);

  const searchRoot = container.ownerDocument?.body ?? container;
  const options = await waitForVisibleOptions(searchRoot);
  if (options.length === 0) {
    return {
      success: false,
      fieldType: 'dropdown',
      jsonPath: mapping.jsonPath,
      message: 'Dropdown options did not appear',
    };
  }

  const match = findBestMatchingOption(options, value);
  if (!match) {
    return {
      success: false,
      fieldType: 'dropdown',
      jsonPath: mapping.jsonPath,
      message: `No dropdown option matching "${value}"`,
    };
  }

  dispatchMouseClick(match);
  await sleep(100);
  context.log(`Filled custom dropdown: ${mapping.jsonPath}`, value);

  return {
    success: true,
    fieldType: 'dropdown',
    jsonPath: mapping.jsonPath,
    automationId: container.getAttribute('data-automation-id') ?? undefined,
  };
}

export const dropdownFillHandler: FillHandler = {
  fieldType: 'dropdown',

  canFill(_element: Element, mapping: FieldMapping): boolean {
    return mapping.fieldType === 'dropdown';
  },

  async fill(
    element: Element,
    value: unknown,
    mapping: FieldMapping,
    context: FillContext
  ): Promise<FillResult> {
    if (element instanceof HTMLInputElement && ['text', 'email', 'tel', 'number', 'search'].includes(element.type)) {
      return {
        success: false,
        fieldType: 'dropdown',
        jsonPath: mapping.jsonPath,
        skipped: true,
        message: 'Element is a plain text input, not a dropdown',
      };
    }

    const strValue = String(value ?? '').trim();
    if (!strValue) {
      return {
        success: false,
        fieldType: 'dropdown',
        jsonPath: mapping.jsonPath,
        skipped: true,
        message: 'Empty value',
      };
    }

    const select =
      element instanceof HTMLSelectElement
        ? element
        : element.querySelector('select');

    if (select instanceof HTMLSelectElement) {
      return fillNativeSelect(select, strValue, mapping, context);
    }

    if (
      element.querySelector('[class*="-control"], [class*="-container"]') ||
      element.classList.toString().includes('-control') ||
      element.closest('[class*="-container"]') ||
      element.closest('.select__container')
    ) {
      const reactRoot =
        element.closest('[class*="-container"]') ??
        element.closest('.select__container') ??
        element;
      return fillReactSelect(reactRoot, strValue, mapping, context);
    }

    return fillCustomDropdown(element, strValue, mapping, context);
  },
};
