import type { ScrapedJob } from '@jobpilot/shared-types';

const SCRAPER_API = '/api/scraper';

export interface JobBrowsePage {
  total: number;
  items: ScrapedJob[];
}

export async function fetchJobs(params?: {
  keyword?: string;
  limit?: number;
  offset?: number;
}): Promise<JobBrowsePage> {
  const query = new URLSearchParams();
  if (params?.keyword) query.set('keyword', params.keyword);
  query.set('limit', String(params?.limit ?? 50));
  query.set('offset', String(params?.offset ?? 0));

  const res = await fetch(`${SCRAPER_API}/jobs?${query.toString()}`);
  if (!res.ok) {
    throw new Error('Failed to load jobs from scraper API');
  }
  return res.json();
}

export async function fetchJobByKey(
  companyId: string,
  source: string,
  jobId: string,
): Promise<ScrapedJob> {
  const query = new URLSearchParams({
    company_id: companyId,
    source,
    job_id: jobId,
  });
  const res = await fetch(`${SCRAPER_API}/jobs/by-key?${query.toString()}`);
  if (!res.ok) {
    throw new Error('Job not found');
  }
  return res.json();
}
