/**
 * Single API client for the JobPilot frontend.
 *
 * Two backends sit behind the Vite dev proxy:
 *   /api/parser  → Parser API (auth, candidate profile, applications)
 *   /api/scraper → Scraper API (scraped jobs feed)
 */

import type { ScrapedJob } from '@jobpilot/shared-types';
import type { CandidateData, ParsedResumeResult, SavedCandidate } from '../types';

const PARSER_API = '/api/parser';
const SCRAPER_API = '/api/scraper';

// ---------------------------------------------------------------------------
// Session storage (auth token + signed-in user)
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'jobpilot_token';
const USER_KEY = 'jobpilot_user';

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function storeSession(auth: AuthResponse): void {
  localStorage.setItem(TOKEN_KEY, auth.token);
  localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---------------------------------------------------------------------------
// Shared request helper
// ---------------------------------------------------------------------------

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const err = await res.json().catch(() => ({}));
  if (typeof err.detail === 'string') return err.detail;
  if (Array.isArray(err.detail) && err.detail[0]?.msg) return err.detail[0].msg;
  return fallback;
}

/** Fetch JSON; on failure throw an Error with the API's `detail` when present. */
async function request<T>(
  url: string,
  fallbackError: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(await errorMessage(res, fallbackError));
  return res.json();
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function register(
  email: string,
  password: string,
  fullName?: string,
): Promise<AuthResponse> {
  return request(
    `${PARSER_API}/auth/register`,
    'Registration failed',
    jsonInit('POST', { email, password, full_name: fullName || null }),
  );
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return request(
    `${PARSER_API}/auth/login`,
    'Login failed',
    jsonInit('POST', { email, password }),
  );
}

export function fetchMe(): Promise<User> {
  return request(`${PARSER_API}/auth/me`, 'Session expired', { headers: authHeaders() });
}

// ---------------------------------------------------------------------------
// Candidate profile (Parser API)
// ---------------------------------------------------------------------------

export function parseResume(file: File): Promise<ParsedResumeResult> {
  const form = new FormData();
  form.append('resume', file);
  return request(`${PARSER_API}/resume/parse`, 'Failed to parse resume', {
    method: 'POST',
    body: form,
    headers: authHeaders(),
  });
}

export function saveCandidate(
  data: CandidateData,
  resume?: File | null,
): Promise<SavedCandidate> {
  const form = new FormData();
  form.append('candidate_json', JSON.stringify(data));
  if (resume) form.append('resume', resume);
  return request(`${PARSER_API}/candidates`, 'Failed to save profile', {
    method: 'POST',
    body: form,
    headers: authHeaders(),
  });
}

export interface MyCandidateResponse extends SavedCandidate {
  data: CandidateData;
}

export async function getMyCandidate(): Promise<MyCandidateResponse | null> {
  const res = await fetch(`${PARSER_API}/candidates/me`, { headers: authHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}

export function checkHealth(): Promise<{ database?: string }> {
  return request(`${PARSER_API}/health/db`, 'API unreachable');
}

// ---------------------------------------------------------------------------
// Applications (Parser API)
// ---------------------------------------------------------------------------

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

export function logApplication(input: LogApplicationInput): Promise<JobApplication> {
  return request(
    `${PARSER_API}/applications`,
    'Failed to log application',
    jsonInit('POST', input),
  );
}

export function fetchApplications(): Promise<JobApplication[]> {
  return request(`${PARSER_API}/applications`, 'Failed to load applications', {
    headers: authHeaders(),
  });
}

export function updateApplicationStatus(
  id: string,
  status: ApplicationStatus,
): Promise<JobApplication> {
  return request(
    `${PARSER_API}/applications/${id}`,
    'Failed to update application',
    jsonInit('PATCH', { status }),
  );
}

// ---------------------------------------------------------------------------
// Jobs (Scraper API)
// ---------------------------------------------------------------------------

export interface JobBrowsePage {
  total: number;
  items: ScrapedJob[];
}

export function fetchJobs(params?: {
  keyword?: string;
  limit?: number;
  offset?: number;
}): Promise<JobBrowsePage> {
  const query = new URLSearchParams();
  if (params?.keyword) query.set('keyword', params.keyword);
  query.set('limit', String(params?.limit ?? 50));
  query.set('offset', String(params?.offset ?? 0));
  return request(`${SCRAPER_API}/jobs?${query.toString()}`, 'Failed to load jobs from scraper API');
}
