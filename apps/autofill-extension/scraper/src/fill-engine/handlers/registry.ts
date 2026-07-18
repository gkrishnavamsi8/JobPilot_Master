import type { FillHandler } from '../types.js';
import { textFillHandler, textareaFillHandler } from './text.js';
import { dropdownFillHandler } from './dropdown.js';
import { checkboxFillHandler } from './checkbox.js';
import { multiselectFillHandler } from './multiselect.js';
import { fileFillHandler } from './file.js';
import { repeatableFillHandler } from './repeatable.js';

const handlers: FillHandler[] = [
  textFillHandler,
  textareaFillHandler,
  dropdownFillHandler,
  checkboxFillHandler,
  multiselectFillHandler,
  fileFillHandler,
  repeatableFillHandler,
];

export function getHandlerForMapping(mapping: { fieldType: string }): FillHandler | undefined {
  return handlers.find((handler) => handler.fieldType === mapping.fieldType);
}

export function registerHandler(handler: FillHandler): void {
  const index = handlers.findIndex((h) => h.fieldType === handler.fieldType);
  if (index >= 0) {
    handlers[index] = handler;
  } else {
    handlers.push(handler);
  }
}

export { handlers };
