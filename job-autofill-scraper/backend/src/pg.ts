import pg from 'pg';
import type { CandidateRecord } from '../../shared/src/profile.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function isPgConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function isSupabasePooler(url: string): boolean {
  return url.includes('supabase.com') || url.includes('pgbouncer=true');
}

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for Postgres connection');
    }
    pool = new Pool({
      connectionString,
      ssl: isSupabasePooler(connectionString) ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

/** PgBouncer transaction mode (port 6543) does not support prepared statements. */
function queryOptions(sql: string, values: unknown[]): pg.QueryConfig {
  const usePgBouncer =
    process.env.DATABASE_URL?.includes('pgbouncer=true') ||
    process.env.DATABASE_URL?.includes(':6543/');

  if (usePgBouncer) {
    return { text: sql, values, prepare: false } as pg.QueryConfig;
  }

  return { text: sql, values };
}

export async function getCandidateByIdFromPg(id: string): Promise<CandidateRecord | null> {
  const result = await getPool().query<CandidateRecord>(
    queryOptions(
      `SELECT id, email, first_name, last_name, resume_path, resume_filename, data, created_at, updated_at
       FROM public.candidates
       WHERE id = $1`,
      [id]
    )
  );
  return result.rows[0] ?? null;
}

export async function getCandidateByEmailFromPg(email: string): Promise<CandidateRecord | null> {
  const result = await getPool().query<CandidateRecord>(
    queryOptions(
      `SELECT id, email, first_name, last_name, resume_path, resume_filename, data, created_at, updated_at
       FROM public.candidates
       WHERE lower(email) = lower($1)
       ORDER BY updated_at DESC
       LIMIT 1`,
      [email]
    )
  );
  return result.rows[0] ?? null;
}

export async function listCandidatesFromPg(limit = 20): Promise<CandidateRecord[]> {
  const result = await getPool().query<CandidateRecord>(
    queryOptions(
      `SELECT id, email, first_name, last_name, resume_path, resume_filename, data, created_at, updated_at
       FROM public.candidates
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limit]
    )
  );
  return result.rows;
}

export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
