import type { FillHandler, FillResult, FieldMapping, FillContext } from '../types.js';
import { getValueAtPath } from '../../../../shared/dist/utils.js';
import { getHandlerForMapping } from './registry.js';
import {
  dispatchMouseClick,
  findAddButton,
  findEntryContainers,
  sleep,
} from '../dom-utils.js';
import { matchesAutomationId } from '../../../../shared/dist/utils.js';

async function fillChildFields(
  container: Element,
  entryData: Record<string, unknown>,
  children: FieldMapping[],
  context: FillContext
): Promise<FillResult[]> {
  const results: FillResult[] = [];

  for (const childMapping of children) {
    const value = getValueAtPath(entryData, childMapping.jsonPath);
    if (value == null || value === '') continue;

    const nodes = container.querySelectorAll('[data-automation-id]');
    let target: Element | null = null;

    for (const node of nodes) {
      const automationId = node.getAttribute('data-automation-id');
      if (!automationId) continue;
      if (!automationId || !childMapping.automationIdPattern) continue;
      if (!matchesAutomationId(automationId, childMapping.automationIdPattern)) continue;

      target =
        node.matches('input, textarea, select, [role="combobox"], [role="textbox"]')
          ? node
          : node.querySelector('input, textarea, select, [role="combobox"], [role="textbox"]') ??
            node;
      break;
    }

    if (!target) {
      results.push({
        success: false,
        fieldType: childMapping.fieldType,
        jsonPath: childMapping.jsonPath,
        skipped: true,
        message: 'Child field not found in entry container',
      });
      continue;
    }

    const handler = getHandlerForMapping(childMapping);
    if (!handler) {
      results.push({
        success: false,
        fieldType: childMapping.fieldType,
        jsonPath: childMapping.jsonPath,
        message: `No handler for ${childMapping.fieldType}`,
      });
      continue;
    }

    const result = await handler.fill(target, value, childMapping, context);
    results.push(result);
    await sleep(80);
  }

  return results;
}

export const repeatableFillHandler: FillHandler = {
  fieldType: 'repeatable',

  canFill(_element: Element, mapping: FieldMapping): boolean {
    return mapping.fieldType === 'repeatable';
  },

  async fill(
    element: Element,
    value: unknown,
    mapping: FieldMapping,
    context: FillContext
  ): Promise<FillResult> {
    const entries = Array.isArray(value) ? value : [];
    const children = mapping.children ?? [];

    if (entries.length === 0) {
      return {
        success: false,
        fieldType: 'repeatable',
        jsonPath: mapping.jsonPath,
        skipped: true,
        message: 'No entries in data',
      };
    }

    if (children.length === 0) {
      return {
        success: false,
        fieldType: 'repeatable',
        jsonPath: mapping.jsonPath,
        message: 'Repeatable mapping has no child field definitions',
      };
    }

    const section =
      element.getAttribute('data-automation-id') &&
      /section|experience|education/i.test(element.getAttribute('data-automation-id') ?? '')
        ? element
        : (element.closest('[data-automation-id*="Section"], [data-automation-id*="section"]') ??
          element);

    let containers = findEntryContainers(section);
    const addButton = findAddButton(section, mapping.addButtonPattern);

    while (containers.length < entries.length && addButton) {
      dispatchMouseClick(addButton);
      await sleep(250);
      containers = findEntryContainers(section);
    }

    if (containers.length === 0) {
      containers = [section];
    }

    let filledCount = 0;
    let failedCount = 0;

    for (let i = 0; i < entries.length; i += 1) {
      const entryData = entries[i] as Record<string, unknown>;
      const container = containers[i] ?? containers[containers.length - 1];
      const childResults = await fillChildFields(container, entryData, children, context);
      filledCount += childResults.filter((r) => r.success).length;
      failedCount += childResults.filter((r) => !r.success && !r.skipped).length;
    }

    context.log(`Repeatable section ${mapping.jsonPath}`, { filledCount, failedCount });

    return {
      success: filledCount > 0,
      fieldType: 'repeatable',
      jsonPath: mapping.jsonPath,
      automationId: section.getAttribute('data-automation-id') ?? undefined,
      message: `Filled ${filledCount} sub-fields across ${entries.length} entries`,
    };
  },
};
