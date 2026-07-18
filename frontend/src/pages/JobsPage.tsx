import { analyzeMatch } from '@jobpilot/match-core';
import { buildUserMatchText, formatJobKey, type CandidateData } from '@jobpilot/shared-types';
import { ExternalLink, Loader2, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fetchJobs, type JobBrowsePage } from '../lib/scraperApi';
import { getStoredCandidateData, getStoredCandidateId } from '../lib/session';
import type { CandidateData as ParserCandidateData } from '../types';

interface JobWithScore {
  job: JobBrowsePage['items'][number];
  score: number;
  matched: string[];
  missing: string[];
}

export function JobsPage() {
  const [jobs, setJobs] = useState<JobBrowsePage['items']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const candidateId = getStoredCandidateId();
  const candidateData = getStoredCandidateData<ParserCandidateData>();

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchJobs({ keyword: keyword || undefined })
      .then((page) => setJobs(page.items))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load jobs'))
      .finally(() => setLoading(false));
  }, [keyword]);

  const scoredJobs = useMemo<JobWithScore[]>(() => {
    if (!candidateData) {
      return jobs.map((job) => ({ job, score: 0, matched: [], missing: [] }));
    }

    const profileText = buildUserMatchText(candidateData as CandidateData);

    return jobs.map((job) => {
      const analysis = analyzeMatch({
        professionalSummary: profileText,
        jobDescription: job.description ?? job.title,
        useWeightedScoring: true,
      });

      return {
        job,
        score: analysis.weightedResult?.weightedScore ?? analysis.result.score,
        matched: analysis.result.matchedSkills,
        missing: analysis.result.missingSkills,
      };
    });
  }, [jobs, candidateData]);

  const handleApply = (job: JobBrowsePage['items'][number]) => {
    if (!candidateId) {
      setError('Save your profile first on the Profile page.');
      return;
    }

    const url = new URL(job.detail_url);
    url.searchParams.set('jp_candidate', candidateId);
    url.searchParams.set('jp_job', formatJobKey(job.company_id, job.source, job.job_id));
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Job browser</h2>
          <p className="mt-1 text-sm text-slate-400">
            Browse scraped jobs, preview your match score, and open the apply page with extension context.
          </p>
        </div>
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Filter by keyword..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900/80 py-2 pl-10 pr-4 text-sm text-white outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {!candidateId && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Save your profile on the Profile page to enable match previews and extension autofill context.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading jobs...
        </div>
      ) : scoredJobs.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-6 py-12 text-center text-slate-400">
          No jobs found. Run the scraper API and scrape a company first.
        </div>
      ) : (
        <div className="space-y-4">
          {scoredJobs.map(({ job, score, matched, missing }) => (
            <article
              key={`${job.company_id}:${job.source}:${job.job_id}`}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl shadow-black/20"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{job.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {job.company_id} · {job.location ?? 'Location n/a'} · {job.source}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-brand-400">{score.toFixed(1)}%</div>
                  <div className="text-xs text-slate-500">match preview</div>
                </div>
              </div>

              {candidateData && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                    <strong>Matched:</strong>{' '}
                    {matched.length ? matched.slice(0, 8).join(', ') : 'None detected'}
                  </div>
                  <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    <strong>Missing:</strong>{' '}
                    {missing.length ? missing.slice(0, 8).join(', ') : 'None'}
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleApply(job)}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500"
                >
                  <ExternalLink className="h-4 w-4" />
                  Apply
                </button>
                {job.detail_url && (
                  <a
                    href={job.detail_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                  >
                    View listing
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
