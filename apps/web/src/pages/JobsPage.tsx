import { analyzeMatch } from '@jobpilot/match-core';
import { buildUserMatchText, formatJobKey, type CandidateData } from '@jobpilot/shared-types';
import {
  ArrowDownWideNarrow,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CloudOff,
  ExternalLink,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ScrapedJob } from '@jobpilot/shared-types';
import { ScoreRing } from '../components/ScoreRing';
import { fetchJobs, logApplication } from '../lib/api';
import { SAMPLE_JOBS } from '../lib/sampleJobs';
import { useCandidate } from '../lib/useCandidate';

interface ScoredJob {
  job: ScrapedJob;
  score: number;
  matched: string[];
  missing: string[];
}

type JobsSource = 'live' | 'sample';

export function JobsPage() {
  const [jobs, setJobs] = useState<ScrapedJob[]>([]);
  const [source, setSource] = useState<JobsSource>('live');
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sortByScore, setSortByScore] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const { candidateId, candidateData } = useCandidate();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(keyword.trim()), 300);
    return () => clearTimeout(t);
  }, [keyword]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchJobs({ keyword: debounced || undefined })
      .then((page) => {
        if (cancelled) return;
        setJobs(page.items);
        setSource('live');
      })
      .catch(() => {
        if (cancelled) return;
        // Scraper API offline (needs Supabase) — fall back to labeled demo data.
        const q = debounced.toLowerCase();
        setJobs(
          q
            ? SAMPLE_JOBS.filter(
                (j) =>
                  j.title.toLowerCase().includes(q) ||
                  (j.description ?? '').toLowerCase().includes(q),
              )
            : SAMPLE_JOBS,
        );
        setSource('sample');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const scored = useMemo<ScoredJob[]>(() => {
    const profileText = candidateData
      ? buildUserMatchText(candidateData as CandidateData)
      : null;

    const rows = jobs.map((job) => {
      if (!profileText) return { job, score: 0, matched: [], missing: [] };
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

    if (sortByScore && profileText) rows.sort((a, b) => b.score - a.score);
    return rows;
  }, [jobs, candidateData, sortByScore]);

  const jobKeyOf = (job: ScrapedJob) => formatJobKey(job.company_id, job.source, job.job_id);

  const handleApply = async ({ job, score, matched, missing }: ScoredJob) => {
    const key = jobKeyOf(job);

    // Open the ATS page with extension context (INTEGRATION_PLAN step 3).
    const url = new URL(job.detail_url);
    if (candidateId) {
      url.searchParams.set('jp_candidate', candidateId);
      url.searchParams.set('jp_job', key);
    }
    window.open(url.toString(), '_blank', 'noopener,noreferrer');

    // Log the event so it shows up in Applications.
    try {
      await logApplication({
        detail_url: job.detail_url,
        candidate_id: candidateId,
        scraped_job_id: key,
        job_title: job.title,
        company: job.hiring_org ?? job.company_id,
        location: job.location,
        weighted_match_score: score,
        match_snapshot: { matched: matched.slice(0, 20), missing: missing.slice(0, 20) },
        status: 'viewed',
      });
      setApplied((prev) => new Set(prev).add(key));
      setNotice('Opened the apply page and tracked it under Applications.');
      setTimeout(() => setNotice(null), 4000);
    } catch {
      // Logging is best-effort; the apply tab is already open.
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Job browser</h2>
          <p className="mt-1 text-sm text-ink-2">
            Every listing scored against your profile. Apply opens the real ATS page with
            extension context.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search title or description…"
              className="w-full pl-10"
            />
          </div>
          <button
            type="button"
            onClick={() => setSortByScore((v) => !v)}
            className={`btn-ghost ${sortByScore ? 'border-brand-500/60 text-brand-300' : ''}`}
            title="Sort by match score"
          >
            <ArrowDownWideNarrow className="h-4 w-4" />
            Best match
          </button>
        </div>
      </div>

      {source === 'sample' && !loading && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 animate-fade-in">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>Scraper API is offline</strong> — showing <strong>sample jobs</strong> so you
            can try the flow. Start the scraper service (needs Supabase) to browse real scraped
            listings.
          </p>
        </div>
      )}

      {!candidateData && !loading && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-brand-200 animate-fade-in">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <Link to="/profile" className="font-semibold underline underline-offset-2">
              Save your profile
            </Link>{' '}
            to unlock match scores, skill gaps, and extension autofill context.
          </p>
        </div>
      )}

      {notice && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 animate-fade-in">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-ink-2">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading jobs…
        </div>
      ) : scored.length === 0 ? (
        <div className="card px-6 py-16 text-center text-ink-2">
          No jobs matched your search.
        </div>
      ) : (
        <div className="space-y-4">
          {scored.map((row, index) => {
            const { job, score, matched, missing } = row;
            const key = jobKeyOf(job);
            const isExpanded = expanded === key;
            const isTracked = applied.has(key);
            return (
              <article
                key={key}
                className="card p-5 transition hover:border-brand-500/40 animate-fade-up"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{job.title}</h3>
                      {source === 'sample' && (
                        <span className="chip border border-amber-500/30 bg-amber-500/10 text-amber-300">
                          Sample
                        </span>
                      )}
                      {isTracked && (
                        <span className="chip border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> Tracked
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
                      <span className="inline-flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-ink-3" />
                        {job.hiring_org ?? job.company_id}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-ink-3" />
                        {job.location ?? 'Location n/a'}
                      </span>
                      {job.date_posted && (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 text-ink-3" />
                          {job.date_posted}
                        </span>
                      )}
                      {job.employment_type && (
                        <span className="chip bg-panel-2 text-ink-2">{job.employment_type}</span>
                      )}
                    </div>
                  </div>

                  {candidateData && (
                    <div className="flex items-center gap-3">
                      <ScoreRing score={score} />
                      <div className="text-xs text-ink-3">
                        match
                        <br />
                        score
                      </div>
                    </div>
                  )}
                </div>

                {candidateData && (matched.length > 0 || missing.length > 0) && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {matched.slice(0, 8).map((skill) => (
                      <span
                        key={`m-${skill}`}
                        className="chip border border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {skill}
                      </span>
                    ))}
                    {missing.slice(0, 6).map((skill) => (
                      <span
                        key={`x-${skill}`}
                        className="chip border border-red-500/20 bg-red-500/10 text-red-300/90"
                      >
                        <XCircle className="h-3 w-3" />
                        {skill}
                      </span>
                    ))}
                  </div>
                )}

                {job.description && isExpanded && (
                  <p className="mt-4 whitespace-pre-line rounded-xl border border-panel-border bg-panel-2/50 p-4 text-sm leading-relaxed text-ink-2 animate-fade-in">
                    {job.description}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => handleApply(row)} className="btn-primary">
                    <ExternalLink className="h-4 w-4" />
                    Apply
                  </button>
                  {job.description && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setExpanded(isExpanded ? null : key)}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                      {isExpanded ? 'Hide description' : 'View description'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
