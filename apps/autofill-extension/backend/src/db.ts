import type { CandidateData, CandidateRecord } from '../../shared/src/profile.js';
import {
  getCandidateByEmailFromSupabase,
  getCandidateByIdFromSupabase,
  isSupabaseConfigured,
  listCandidatesFromSupabase,
} from './supabase.js';
import {
  closePgPool,
  getCandidateByEmailFromPg,
  getCandidateByIdFromPg,
  isPgConfigured,
  listCandidatesFromPg,
} from './pg.js';

export function getDatabaseMode(): 'supabase' | 'postgres' | 'none' {
  if (isSupabaseConfigured()) return 'supabase';
  if (isPgConfigured()) return 'postgres';
  return 'none';
}

export async function getCandidateById(id: string): Promise<CandidateRecord | null> {
  if (isSupabaseConfigured()) return getCandidateByIdFromSupabase(id);
  if (isPgConfigured()) return getCandidateByIdFromPg(id);
  throw new Error('No database configured. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL.');
}

export async function getCandidateByEmail(email: string): Promise<CandidateRecord | null> {
  if (isSupabaseConfigured()) return getCandidateByEmailFromSupabase(email);
  if (isPgConfigured()) return getCandidateByEmailFromPg(email);
  throw new Error('No database configured. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL.');
}

export async function listCandidates(limit = 20): Promise<CandidateRecord[]> {
  if (isSupabaseConfigured()) return listCandidatesFromSupabase(limit);
  if (isPgConfigured()) return listCandidatesFromPg(limit);
  throw new Error('No database configured. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL.');
}

export function toApiResponse(candidate: CandidateRecord) {
  return {
    id: candidate.id,
    email: candidate.email,
    first_name: candidate.first_name,
    last_name: candidate.last_name,
    data: candidate.data as CandidateData,
  };
}

export async function closePool(): Promise<void> {
  await closePgPool();
}
