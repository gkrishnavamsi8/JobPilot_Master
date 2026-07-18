export interface Phone {
  type?: string | null;
  number?: string | null;
  country_code?: string | null;
}

export interface Address {
  city?: string | null;
  line1?: string | null;
  line2?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
}

export interface Profile {
  email?: string | null;
  phone?: Phone | null;
  skills?: string[];
  social?: Record<string, string | null> | null;
  address?: Address | null;
  summary?: string | null;
  last_name?: string | null;
  first_name?: string | null;
  preferred_name?: string | null;
}

export interface EducationEntry {
  gpa?: string | null;
  degree?: string | null;
  school?: string | null;
  end_date?: string | null;
  is_current?: boolean;
  start_date?: string | null;
  field_of_study?: string | null;
}

export interface WorkExperienceEntry {
  title?: string | null;
  company?: string | null;
  end_date?: string | null;
  location?: string | null;
  is_current?: boolean;
  start_date?: string | null;
  description?: string | null;
  employment_type?: string | null;
}

export interface Preferences {
  referred_by?: string | null;
  desired_salary?: number | null;
  referral_source?: string | null;
  salary_currency?: string | null;
  remote_preference?: string | null;
  notice_period_days?: number | null;
  willing_to_relocate?: boolean | null;
  years_of_experience?: number | null;
  available_start_date?: string | null;
}

export interface CandidateData {
  legal?: Record<string, unknown> | null;
  profile?: Profile | null;
  education?: EducationEntry[];
  preferences?: Preferences | null;
  cover_letter?: string | null;
  demographics?: Record<string, unknown> | null;
  custom_answers?: unknown[];
  work_experience?: WorkExperienceEntry[];
  additional_files?: unknown[];
  work_authorization?: Record<string, unknown> | null;
}

export interface CandidateRecord {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  resume_path: string | null;
  resume_filename: string | null;
  data: CandidateData;
  created_at: string;
  updated_at: string;
}

export interface CandidateApiResponse {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  data: CandidateData;
}

export interface ScrapedJob {
  company_id: string;
  source: string;
  job_id: string;
  title: string;
  location?: string | null;
  country?: string | null;
  date_posted?: string | null;
  detail_url: string;
  employment_type?: string | null;
  hiring_org?: string | null;
  description?: string | null;
}
