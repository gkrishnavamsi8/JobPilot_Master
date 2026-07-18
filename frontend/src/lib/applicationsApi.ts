import { authHeaders } from './authApi';

const API = '/api/parser';

export type ApplicationStatus = 'viewed' | 'applied' | 'skipped';

export interface JobApplication {
  id: string;
  user_id: string | null;
  candidate_id: string | null;
  scraped_job_id: string | null;
  detail_url: string;
  job_title: string | null;
  company: string | null;
  location: string | null;
  match_score: number | null;
  weighted_match_score: number | null;
  match_snapshot: { matched?: string[]; missing?: string[] } | null;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
}

export interface LogApplicationInput {
  detail_url: string;
  candidate_id?: string | null;
  scraped_job_id?: string | null;
  job_title?: string | null;
  company?: string | null;
  location?: string | null;
  match_score?: number | null;
  weighted_match_score?: number | null;
  match_snapshot?: { matched?: string[]; missing?: string[] } | null;
  status?: ApplicationStatus;
}

export async function logApplication(input: LogApplicationInput): Promise<JobApplication> {
  const res = await fetch(`${API}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to log application');
  return res.json();
}

export async function fetchApplications(): Promise<JobApplication[]> {
  const res = await fetch(`${API}/applications`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load applications');
  return res.json();
}

export async function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
): Promise<JobApplication> {
  const res = await fetch(`${API}/applications/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update application');
  return res.json();
}
