import type { CandidateData } from '../../../shared/dist/profile.js';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'dropdown'
  | 'checkbox'
  | 'multiselect'
  | 'file'
  | 'repeatable';

export interface FieldMapping {
  /** Substring or regex matched against data-automation-id (case-insensitive). */
  automationIdPattern?: string | RegExp;
  /** Match input/select `name` attribute (Greenhouse and other ATS). */
  namePattern?: string | RegExp;
  /** Match element `id` attribute. */
  idPattern?: string | RegExp;
  /** Dot/bracket path into candidate data, e.g. profile.first_name */
  jsonPath: string;
  fieldType: FieldType;
  /** Label synonyms — primary matcher for Greenhouse; fallback for Workday. */
  labelSynonyms?: string[];
  /** For repeatable sections: child mappings scoped to each entry container. */
  children?: FieldMapping[];
  /** Button automation-id substring to add another entry. */
  addButtonPattern?: string;
}

export interface FillResult {
  success: boolean;
  fieldType: FieldType;
  automationId?: string;
  jsonPath: string;
  message?: string;
  skipped?: boolean;
}

export interface FillRunSummary {
  filled: FillResult[];
  skipped: FillResult[];
  failed: FillResult[];
}

export interface FillContext {
  candidateData: CandidateData;
  document: Document;
  log: (message: string, detail?: unknown) => void;
}

export interface FillHandler {
  readonly fieldType: FieldType;
  canFill(element: Element, mapping: FieldMapping): boolean;
  fill(element: Element, value: unknown, mapping: FieldMapping, context: FillContext): Promise<FillResult>;
}

export interface ScannedField {
  element: Element;
  automationId: string;
  mapping: FieldMapping;
  value: unknown;
}
