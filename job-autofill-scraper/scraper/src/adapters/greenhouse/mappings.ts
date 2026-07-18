import type { FieldMapping } from '../../fill-engine/types.js';

/**
 * Greenhouse job board field mappings.
 * Primary detection: label text, then name/id attributes.
 */
export const GREENHOUSE_FIELD_MAPPINGS: FieldMapping[] = [
  {
    labelSynonyms: ['first name'],
    namePattern: /first[_\[]?name/i,
    idPattern: /^first_name$/i,
    automationIdPattern: 'first_name',
    jsonPath: 'profile.first_name',
    fieldType: 'text',
  },
  {
    labelSynonyms: ['last name'],
    namePattern: /last[_\[]?name/i,
    idPattern: /^last_name$/i,
    automationIdPattern: 'last_name',
    jsonPath: 'profile.last_name',
    fieldType: 'text',
  },
  {
    labelSynonyms: ['email'],
    namePattern: /email/i,
    idPattern: /^email$/i,
    automationIdPattern: 'email',
    jsonPath: 'profile.email',
    fieldType: 'text',
  },
  {
    labelSynonyms: ['phone'],
    namePattern: /phone/i,
    idPattern: /^phone$/i,
    automationIdPattern: 'phone',
    jsonPath: 'profile.phone.number',
    fieldType: 'text',
  },
  {
    labelSynonyms: ['country'],
    namePattern: /country/i,
    idPattern: /^country$/i,
    automationIdPattern: 'country',
    jsonPath: 'profile.address.country',
    fieldType: 'dropdown',
  },
  {
    labelSynonyms: ['linkedin profile', 'linkedin'],
    namePattern: /linkedin/i,
    idPattern: /linkedin/i,
    jsonPath: 'profile.social.linkedin',
    fieldType: 'text',
  },
  {
    labelSynonyms: ['website'],
    namePattern: /website/i,
    idPattern: /website/i,
    jsonPath: 'profile.social.website',
    fieldType: 'text',
  },
  {
    labelSynonyms: ['github'],
    namePattern: /github/i,
    jsonPath: 'profile.social.github',
    fieldType: 'text',
  },
  {
    labelSynonyms: ['home address', 'address'],
    namePattern: /address/i,
    idPattern: /address/i,
    jsonPath: 'profile.address.line1',
    fieldType: 'text',
  },
  {
    labelSynonyms: ['current company', 'company'],
    namePattern: /company/i,
    jsonPath: 'work_experience[0].company',
    fieldType: 'text',
  },
  {
    labelSynonyms: ['current title', 'job title'],
    namePattern: /title/i,
    jsonPath: 'work_experience[0].title',
    fieldType: 'text',
  },
  {
    labelSynonyms: ['cover letter'],
    namePattern: /cover[_\[]?letter/i,
    jsonPath: 'cover_letter',
    fieldType: 'textarea',
  },
  {
    labelSynonyms: ['resume', 'resume/cv', 'cv'],
    namePattern: /resume|cv/i,
    idPattern: /resume|cv/i,
    jsonPath: 'resume_filename',
    fieldType: 'file',
  },
  {
    labelSynonyms: ['i agree', 'zscaler confidential', 'privacy policy', 'terms'],
    namePattern: /agree|consent|privacy|terms/i,
    jsonPath: 'legal.terms_accepted',
    fieldType: 'checkbox',
  },
];
