import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CandidateRecord } from '../../shared/src/profile.js';

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

const CANDIDATE_COLUMNS =
  'id, email, first_name, last_name, resume_path, resume_filename, data, created_at, updated_at';

export async function getCandidateByIdFromSupabase(
  id: string
): Promise<CandidateRecord | null> {
  const { data, error } = await getSupabase()
    .from('candidates')
    .select(CANDIDATE_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return (data as CandidateRecord | null) ?? null;
}

export async function getCandidateByEmailFromSupabase(
  email: string
): Promise<CandidateRecord | null> {
  const { data, error } = await getSupabase()
    .from('candidates')
    .select(CANDIDATE_COLUMNS)
    .ilike('email', email)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as CandidateRecord | null) ?? null;
}

export async function listCandidatesFromSupabase(limit = 20): Promise<CandidateRecord[]> {
  const { data, error } = await getSupabase()
    .from('candidates')
    .select(CANDIDATE_COLUMNS)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as CandidateRecord[]) ?? [];
}
