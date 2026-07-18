import {
  Building2,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Eye,
  Loader2,
  MapPin,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchApplications,
  updateApplicationStatus,
  type ApplicationStatus,
  type JobApplication,
} from '../lib/api';

const STATUS_META: Record<
  ApplicationStatus,
  { label: string; icon: typeof Eye; classes: string }
> = {
  viewed: {
    label: 'Viewed',
    icon: Eye,
    classes: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  },
  applied: {
    label: 'Applied',
    icon: CheckCircle2,
    classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
  skipped: {
    label: 'Skipped',
    icon: XCircle,
    classes: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  },
};

const FILTERS: Array<ApplicationStatus | 'all'> = ['all', 'viewed', 'applied', 'skipped'];

export function ApplicationsPage() {
  const [items, setItems] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetchApplications()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load applications'))
      .finally(() => setLoading(false));
  }, []);

  const setStatus = async (id: string, status: ApplicationStatus) => {
    setSavingId(id);
    try {
      const updated = await updateApplicationStatus(id, status);
      setItems((prev) => prev.map((a) => (a.id === id ? updated : a)));
    } catch {
      setError('Could not update status — is the Parser API running?');
    } finally {
      setSavingId(null);
    }
  };

  const visible = filter === 'all' ? items : items.filter((a) => a.status === filter);
  const counts = {
    all: items.length,
    viewed: items.filter((a) => a.status === 'viewed').length,
    applied: items.filter((a) => a.status === 'applied').length,
    skipped: items.filter((a) => a.status === 'skipped').length,
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Applications</h2>
          <p className="mt-1 text-sm text-ink-2">
            Every job you opened from the browser, with the match snapshot taken at apply time.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border border-panel-border bg-panel-2/60 p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                filter === f ? 'bg-brand-600 text-white' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {f} <span className="opacity-60">({counts[f]})</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-ink-2">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading applications…
        </div>
      ) : visible.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 px-6 py-16 text-center animate-fade-up">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
            <ClipboardList className="h-7 w-7" />
          </div>
          <div>
            <p className="font-semibold text-ink">
              {items.length === 0 ? 'Nothing tracked yet' : 'Nothing with this status'}
            </p>
            <p className="mt-1 text-sm text-ink-2">
              {items.length === 0
                ? 'Open a job from the Jobs page and it will appear here automatically.'
                : 'Try a different filter.'}
            </p>
          </div>
          {items.length === 0 && (
            <Link to="/jobs" className="btn-primary">
              Browse jobs
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((app, index) => {
            const meta = STATUS_META[app.status];
            const StatusIcon = meta.icon;
            const score = app.weighted_match_score ?? app.match_score;
            return (
              <article
                key={app.id}
                className="card p-5 animate-fade-up"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">
                        {app.job_title ?? 'Untitled role'}
                      </h3>
                      <span className={`chip border ${meta.classes}`}>
                        <StatusIcon className="h-3 w-3" />
                        {meta.label}
                      </span>
                      {score != null && (
                        <span className="chip border border-brand-500/30 bg-brand-500/10 text-brand-300">
                          {score.toFixed(1)}% match
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
                      {app.company && (
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-ink-3" /> {app.company}
                        </span>
                      )}
                      {app.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-ink-3" /> {app.location}
                        </span>
                      )}
                      <span className="text-ink-3">
                        {new Date(app.updated_at).toLocaleString()}
                      </span>
                    </div>
                    {app.match_snapshot?.matched && app.match_snapshot.matched.length > 0 && (
                      <p className="mt-2 truncate text-xs text-ink-3">
                        Matched at apply time: {app.match_snapshot.matched.slice(0, 8).join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={app.status}
                      disabled={savingId === app.id}
                      onChange={(e) => setStatus(app.id, e.target.value as ApplicationStatus)}
                      className="!py-1.5 text-xs"
                    >
                      <option value="viewed">Viewed</option>
                      <option value="applied">Applied</option>
                      <option value="skipped">Skipped</option>
                    </select>
                    <a
                      href={app.detail_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost !px-3 !py-1.5 text-xs"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
