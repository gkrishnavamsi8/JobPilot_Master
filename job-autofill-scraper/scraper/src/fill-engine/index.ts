import type { CandidateData } from '../../../shared/dist/profile.js';
import type {
  FillContext,
  FillResult,
  FillRunSummary,
  FieldMapping,
  ScannedField,
} from './types.js';
import { getHandlerForMapping } from './handlers/registry.js';
import { getPlatformConfig, scanWithFallback } from '../adapters/platform.js';

export interface FillEngineOptions {
  mappings?: FieldMapping[];
  hostname?: string;
  useLabelFallback?: boolean;
  onLog?: (message: string, detail?: unknown) => void;
}

/**
 * Core fill engine: scan DOM → resolve values → dispatch to type-specific handlers.
 * Uses one universal scanner for all job boards.
 */
export async function runFillEngine(
  document: Document,
  candidateData: CandidateData,
  options: FillEngineOptions = {}
): Promise<FillRunSummary> {
  const hostname =
    options.hostname ?? document.defaultView?.location.hostname ?? '';
  const config = getPlatformConfig(hostname);
  if (options.mappings) {
    config.mappings = options.mappings;
  }

  const log = options.onLog ?? (() => undefined);
  const context: FillContext = { candidateData, document, log };

  const summary: FillRunSummary = { filled: [], skipped: [], failed: [] };

  log(`Scanning page (${hostname || 'unknown host'})`);

  let scanned = scanWithFallback(document, candidateData, config);

  const fillOrder: Record<string, number> = {
    text: 0,
    textarea: 1,
    dropdown: 2,
    multiselect: 3,
    checkbox: 4,
    repeatable: 5,
    file: 6,
  };
  scanned.sort(
    (a, b) => (fillOrder[a.mapping.fieldType] ?? 9) - (fillOrder[b.mapping.fieldType] ?? 9)
  );

  const repeatable = scanned.filter((f) => f.mapping.fieldType === 'repeatable');
  const flat = scanned.filter((f) => f.mapping.fieldType !== 'repeatable');
  scanned = [...repeatable, ...flat];

  log(`Found ${scanned.length} mappable fields`, scanned.map((s) => s.mapping.jsonPath));

  for (const field of scanned) {
    const handler = getHandlerForMapping(field.mapping);
    if (!handler) {
      summary.failed.push({
        success: false,
        fieldType: field.mapping.fieldType,
        jsonPath: field.mapping.jsonPath,
        message: `No handler for field type: ${field.mapping.fieldType}`,
      });
      continue;
    }

    try {
      const result: FillResult = await handler.fill(
        field.element,
        field.value,
        field.mapping,
        context
      );

      if (result.success) {
        summary.filled.push(result);
      } else if (result.skipped) {
        summary.skipped.push(result);
      } else {
        summary.failed.push(result);
      }
    } catch (error) {
      summary.failed.push({
        success: false,
        fieldType: field.mapping.fieldType,
        jsonPath: field.mapping.jsonPath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  log('Fill run complete', summary);
  return summary;
}

export { UNIVERSAL_FIELD_MAPPINGS } from '../adapters/platform.js';
export type { FieldMapping, FillRunSummary, FillResult, ScannedField } from './types.js';
