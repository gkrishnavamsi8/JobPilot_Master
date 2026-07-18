export interface PartialAddress {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

export interface PartialPhone {
  number?: string | null;
  type?: string;
  country_code?: string | null;
}

export interface PartialSocial {
  linkedin?: string | null;
  github?: string | null;
  portfolio?: string | null;
  website?: string | null;
}

export interface PartialProfile {
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  email?: string | null;
  phone?: PartialPhone | null;
  address?: PartialAddress | null;
  social?: PartialSocial;
  summary?: string | null;
  skills?: string[];
}

export interface WorkExperience {
  company?: string | null;
  title?: string | null;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean;
  description?: string | null;
}

export interface Education {
  school?: string | null;
  degree?: string | null;
  field_of_study?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  gpa?: string | null;
  is_current?: boolean;
}

export interface WorkAuthorization {
  status: string;
  requires_sponsorship_now?: boolean | null;
  requires_sponsorship_future?: boolean | null;
  notes?: string | null;
}

export interface Preferences {
  willing_to_relocate?: boolean | null;
  remote_preference?: string | null;
  desired_salary?: string | null;
  salary_currency?: string | null;
  available_start_date?: string | null;
  notice_period_days?: number | null;
  referral_source?: string | null;
  years_of_experience?: number | null;
}

export interface CustomAnswer {
  question_text: string;
  answer_type?: string;
  answer?: string | null;
}

export interface CandidateData {
  profile?: PartialProfile | null;
  work_experience?: WorkExperience[];
  education?: Education[];
  work_authorization?: WorkAuthorization | null;
  preferences?: Preferences;
  custom_answers?: CustomAnswer[];
  metadata?: Record<string, unknown>;
}

export interface ParsedResumeResult {
  extracted: CandidateData;
  filled_fields: string[];
}

export interface SavedCandidate {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export const WORK_AUTH_OPTIONS = [
  { value: "us_citizen", label: "US Citizen" },
  { value: "permanent_resident", label: "Permanent Resident" },
  { value: "work_visa", label: "Work Visa Holder" },
  { value: "student_visa", label: "Student Visa" },
  { value: "need_sponsorship", label: "Need Sponsorship" },
  { value: "not_authorized", label: "Not Authorized to Work" },
  { value: "other", label: "Other" },
];

export const DEGREE_OPTIONS = [
  { value: "high_school", label: "High School" },
  { value: "associate", label: "Associate" },
  { value: "bachelors", label: "Bachelor's" },
  { value: "masters", label: "Master's" },
  { value: "mba", label: "MBA" },
  { value: "doctorate", label: "Doctorate" },
  { value: "bootcamp", label: "Bootcamp" },
  { value: "certificate", label: "Certificate" },
  { value: "other", label: "Other" },
];

export function emptyCandidate(): CandidateData {
  return {
    profile: {
      phone: { type: "mobile" },
      address: {},
      social: {},
      skills: [],
    },
    work_experience: [],
    education: [],
    preferences: { salary_currency: "USD" },
    custom_answers: [],
  };
}
