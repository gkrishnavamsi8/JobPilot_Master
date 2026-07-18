import type { FieldMapping } from '../../fill-engine/types.js';
import { matchesAutomationId } from '../../../../shared/dist/utils.js';

/**
 * Extensible Workday field mapping table.
 * Add entries here after inspecting real Workday tenants — no core engine changes needed.
 */
export const WORKDAY_FIELD_MAPPINGS: FieldMapping[] = [
  // --- Profile / contact ---
  {
    automationIdPattern: /firstname|firstName/i,
    jsonPath: 'profile.first_name',
    fieldType: 'text',
    labelSynonyms: ['first name', 'given name'],
  },
  {
    automationIdPattern: /lastname|lastName/i,
    jsonPath: 'profile.last_name',
    fieldType: 'text',
    labelSynonyms: ['last name', 'family name', 'surname'],
  },
  {
    automationIdPattern: 'email',
    jsonPath: 'profile.email',
    fieldType: 'text',
    labelSynonyms: ['email', 'email address', 'contact email'],
  },
  {
    automationIdPattern: /phone.*number|phonenumber/i,
    jsonPath: 'profile.phone.number',
    fieldType: 'text',
    labelSynonyms: ['phone', 'phone number', 'mobile', 'telephone'],
  },
  {
    automationIdPattern: /address.*line1|addressline1|street/i,
    jsonPath: 'profile.address.line1',
    fieldType: 'text',
    labelSynonyms: ['address line 1', 'street address', 'address'],
  },
  {
    automationIdPattern: /address.*line2|addressline2/i,
    jsonPath: 'profile.address.line2',
    fieldType: 'text',
    labelSynonyms: ['address line 2', 'apt', 'suite'],
  },
  {
    automationIdPattern: /address.*city|city/i,
    jsonPath: 'profile.address.city',
    fieldType: 'text',
    labelSynonyms: ['city', 'town'],
  },
  {
    automationIdPattern: /address.*state|state/i,
    jsonPath: 'profile.address.state',
    fieldType: 'text',
    labelSynonyms: ['state', 'province', 'region'],
  },
  {
    automationIdPattern: /postal|zip/i,
    jsonPath: 'profile.address.postal_code',
    fieldType: 'text',
    labelSynonyms: ['postal code', 'zip', 'zip code'],
  },
  {
    automationIdPattern: /country/i,
    jsonPath: 'profile.address.country',
    fieldType: 'dropdown',
    labelSynonyms: ['country'],
  },
  {
    automationIdPattern: /linkedin/i,
    jsonPath: 'profile.social.linkedin',
    fieldType: 'text',
    labelSynonyms: ['linkedin', 'linkedin url'],
  },
  {
    automationIdPattern: /website|portfolio/i,
    jsonPath: 'profile.social.website',
    fieldType: 'text',
    labelSynonyms: ['website', 'portfolio', 'personal website'],
  },
  {
    automationIdPattern: /summary|about/i,
    jsonPath: 'profile.summary',
    fieldType: 'textarea',
    labelSynonyms: ['summary', 'about you', 'professional summary'],
  },

  // --- Preferences ---
  {
    automationIdPattern: /years.*experience|yearsofexperience/i,
    jsonPath: 'preferences.years_of_experience',
    fieldType: 'text',
    labelSynonyms: ['years of experience'],
  },
  {
    automationIdPattern: /salary|compensation/i,
    jsonPath: 'preferences.desired_salary',
    fieldType: 'text',
    labelSynonyms: ['desired salary', 'salary expectation'],
  },

  // --- Legal / checkboxes ---
  {
    automationIdPattern: /terms|privacy|consent|agree/i,
    jsonPath: 'legal.terms_accepted',
    fieldType: 'checkbox',
    labelSynonyms: ['terms', 'privacy policy', 'i agree'],
  },

  // --- Skills (multi-select — handler stub for now) ---
  {
    automationIdPattern: /skill/i,
    jsonPath: 'profile.skills',
    fieldType: 'multiselect',
    labelSynonyms: ['skills', 'skill'],
  },

  // --- Resume upload (manual in v1) ---
  {
    automationIdPattern: /resume|cv|file/i,
    jsonPath: 'resume_filename',
    fieldType: 'file',
    labelSynonyms: ['resume', 'cv', 'upload resume'],
  },

  // --- Repeatable: work experience ---
  {
    automationIdPattern: /workExperienceSection|workExperience-?section/i,
    jsonPath: 'work_experience',
    fieldType: 'repeatable',
    addButtonPattern: 'workExperienceAdd',
    children: [
      {
        automationIdPattern: /jobtitle|title/i,
        jsonPath: 'title',
        fieldType: 'text',
        labelSynonyms: ['job title', 'title'],
      },
      {
        automationIdPattern: /company|employer/i,
        jsonPath: 'company',
        fieldType: 'text',
        labelSynonyms: ['company', 'employer'],
      },
      {
        automationIdPattern: /location/i,
        jsonPath: 'location',
        fieldType: 'text',
        labelSynonyms: ['location', 'city'],
      },
      {
        automationIdPattern: /description|responsibilit/i,
        jsonPath: 'description',
        fieldType: 'textarea',
        labelSynonyms: ['description', 'responsibilities'],
      },
    ],
  },

  // --- Repeatable: education ---
  {
    automationIdPattern: /educationSection|education-?section/i,
    jsonPath: 'education',
    fieldType: 'repeatable',
    addButtonPattern: 'educationAdd',
    children: [
      {
        automationIdPattern: /school|university|institution/i,
        jsonPath: 'school',
        fieldType: 'text',
        labelSynonyms: ['school', 'university', 'institution'],
      },
      {
        automationIdPattern: /degree/i,
        jsonPath: 'degree',
        fieldType: 'text',
        labelSynonyms: ['degree'],
      },
      {
        automationIdPattern: /field.*study|major/i,
        jsonPath: 'field_of_study',
        fieldType: 'text',
        labelSynonyms: ['field of study', 'major'],
      },
      {
        automationIdPattern: /gpa/i,
        jsonPath: 'gpa',
        fieldType: 'text',
        labelSynonyms: ['gpa'],
      },
    ],
  },
];

export function findMappingForAutomationId(
  automationId: string,
  mappings: FieldMapping[] = WORKDAY_FIELD_MAPPINGS
): FieldMapping | undefined {
  const normalized = automationId.toLowerCase();
  let best: { mapping: FieldMapping; score: number } | undefined;

  for (const mapping of mappings) {
    if (!mapping.automationIdPattern) continue;
    if (!matchesAutomationId(automationId, mapping.automationIdPattern)) continue;

    let score = 1;
    const pattern =
      mapping.automationIdPattern instanceof RegExp
        ? mapping.automationIdPattern.source
        : mapping.automationIdPattern;
    score += pattern.length;

    if (mapping.fieldType === 'repeatable' && normalized.includes('section')) {
      score += 50;
    }
    if (mapping.fieldType === 'file' && normalized.includes('resume')) {
      score += 20;
    }
    if (mapping.fieldType === 'multiselect' && normalized.includes('multiselect')) {
      score += 20;
    }

    if (!best || score > best.score) {
      best = { mapping, score };
    }
  }

  return best?.mapping;
}
