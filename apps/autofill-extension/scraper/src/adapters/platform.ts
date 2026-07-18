import type { CandidateData } from '../../../shared/dist/profile.js';
import type { FieldMapping, ScannedField } from '../fill-engine/types.js';
import {
  scanUniversalFields,
  UNIVERSAL_FIELD_MAPPINGS,
} from './universal/scanner.js';

export interface PlatformConfig {
  mappings: FieldMapping[];
  scanFields: (
    root: Document | Element,
    candidateData: unknown,
    mappings: FieldMapping[]
  ) => ScannedField[];
}

export function getPlatformConfig(_hostname?: string): PlatformConfig {
  return {
    mappings: UNIVERSAL_FIELD_MAPPINGS,
    scanFields: scanUniversalFields,
  };
}

export function scanWithFallback(
  root: Document | Element,
  candidateData: CandidateData,
  config: PlatformConfig
): ScannedField[] {
  return config.scanFields(root, candidateData, config.mappings);
}

export { UNIVERSAL_FIELD_MAPPINGS };
