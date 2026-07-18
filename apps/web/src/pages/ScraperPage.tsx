import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Hash,
  Loader2,
  MapPin,
  Radar,
  Search,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchCompanies,
  fetchRun,
  fetchRuns,
  startScrape,
  type Company,
  type ScrapeRun,
} from '../lib/api';

const STEPS = ['Select', 'Configure', 'Scrape', 'Done'] as const;

const RUNNING_STATUSES = new Set(['queued', 'pending', 'running', 'started']);
const SUCCESS_STATUSES = new Set(['succeeded', 'completed', 'success']);

const isRunning = (status: string) => RUNNING_STATUSES.has(status.toLowerCase());
const isSucceeded = (status: string) => SUCCESS_STATUSES.has(status.toLowerCase());

function StatusChip({ status }: { status: string }) {
  const classes = isRunning(status)
    ? 'border-brand-500/40 bg-brand-500/10 text-brand-300'
    : isSucceeded(status)
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : 'border-red-500/30 bg-red-500/10 text-red-300';
  const Icon = isRunning(status) ? Loader2 : isSucceeded(status) ? CheckCircle2 : XCircle;
  return (
    <span className={`chip border uppercase tracking-wide ${classes}`}>
      <Icon className={`h-3 w-3 ${isRunning(status) ? 'animate-spin' : ''}`} />
      {status.toLowerCase()}
    </span>
  );
}

function CounterTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-panel-border bg-panel-2/60 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink">{value}</p>
    </div>
  );
}

export function ScraperPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Company | null>(null);

  const [dateScope, setDateScope] = useState<'today' | 'all'>('all');
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [limit, setLimit] = useState('100');

  const [activeRun, setActiveRun] = useState<ScrapeRun | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<ScrapeRun[]>([]);
  const pollRef = useRef<number | null>(null);

  const loadRuns = useCallback(() => {
    fetchRuns(8)
      .then((runs) => {
        // The API merges persisted + live runs and can repeat an id.
        const seen = new Set<string>();
        setRecentRuns(runs.filter((r) => !seen.has(r.id) && seen.add(r.id)));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetchCompanies()
      .then((rows) => {
        // Companies with a scraper plugin first, then alphabetical.
        rows.sort((a, b) =>
          a.supported === b.supported ? a.name.localeCompare(b.name) : a.supported ? -1 : 1,
        );
        setCompanies(rows);
      })
      .catch(() =>
        setCompaniesError('Scraper API is offline — start it to browse companies and run scrapes.'),
      )
      .finally(() => setLoadingCompanies(false));
    loadRuns();
  }, [loadRuns]);

  // Poll the active run until it settles.
  useEffect(() => {
    if (!activeRun || !isRunning(activeRun.status)) {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = window.setInterval(() => {
      fetchRun(activeRun.id)
        .then((run) => {
          setActiveRun(run);
          if (!isRunning(run.status)) loadRuns();
        })
        .catch(() => undefined);
    }, 2500);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [activeRun, loadRuns]);

  const visibleCompanies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.platform ?? '').toLowerCase().includes(q),
    );
  }, [companies, query]);

  const running = activeRun ? isRunning(activeRun.status) : false;
  const stepIndex = !selected
    ? 0
    : running
      ? 2
      : activeRun && isSucceeded(activeRun.status)
        ? 3
        : 1;

  const handleStart = async () => {
    if (!selected) return;
    setError(null);
    setStarting(true);
    try {
      const res = await startScrape(selected.id, {
        date_scope: dateScope,
        keyword: keyword.trim() || null,
        location: location.trim() || null,
        limit: limit ? Number(limit) : null,
      });
      const run = await fetchRun(res.run_id).catch(() => null);
      setActiveRun(
        run ?? {
          id: res.run_id,
          company_id: selected.id,
          company_name: selected.name,
          platform: selected.platform ?? 'unknown',
          status: res.status,
          stubs_seen: 0,
          details_fetched: 0,
          matched: 0,
          errors: 0,
          total_pages: 0,
          started_at: new Date().toISOString(),
        },
      );
      loadRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start scrape');
    } finally {
      setStarting(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 animate-fade-up">
        <h2 className="text-2xl font-bold tracking-tight text-white">Scraper admin</h2>
        <p className="mt-1 text-sm text-ink-2">
          Pull fresh listings from company career sites straight into your job browser.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ---- Console ---- */}
        <section className="card overflow-hidden animate-fade-up">
          {/* Stepper header */}
          <div className="border-b border-panel-border bg-gradient-to-b from-brand-500/[0.07] to-transparent px-6 pb-4 pt-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white">
                <Radar className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-semibold leading-tight text-white">Run a scrape</p>
                <p className="text-xs text-ink-3">Company career pages → your job browser</p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-1.5">
              {STEPS.map((label, i) => {
                const done = i < stepIndex;
                const active = i === stepIndex;
                return (
                  <div
                    key={label}
                    className="flex min-w-0 items-center gap-1.5 [&:not(:last-child)]:flex-1"
                  >
                    <span className="flex items-center gap-1.5">
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-brand-400" />
                      ) : (
                        <CircleDashed
                          className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-brand-400' : 'text-ink-3'}`}
                        />
                      )}
                      <span
                        className={`whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wider ${
                          active || done ? 'text-brand-300' : 'text-ink-3'
                        }`}
                      >
                        {label}
                      </span>
                    </span>
                    {i < STEPS.length - 1 && (
                      <span
                        className={`h-px flex-1 ${done ? 'bg-brand-500/50' : 'bg-panel-border'}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-5 p-6">
            {companiesError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {companiesError}
              </div>
            )}

            {/* Company picker */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-2">
                <Building2 className="h-3.5 w-3.5" /> Company
              </p>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search companies or platforms…"
                  className="w-full pl-10"
                />
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-panel-border bg-panel-2/40 p-1.5">
                {loadingCompanies ? (
                  <p className="flex items-center gap-2 px-3 py-4 text-sm text-ink-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading companies…
                  </p>
                ) : visibleCompanies.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-ink-2">No companies matched.</p>
                ) : (
                  visibleCompanies.slice(0, 60).map((c) => {
                    const isSel = selected?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelected(c);
                          setActiveRun(null);
                          setError(null);
                        }}
                        disabled={!c.supported}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition ${
                          isSel
                            ? 'border border-brand-500 bg-brand-500/10'
                            : 'border border-transparent hover:bg-panel-2'
                        } ${c.supported ? '' : 'cursor-not-allowed opacity-40'}`}
                      >
                        <span
                          className={`truncate text-sm font-medium ${isSel ? 'text-brand-200' : 'text-ink'}`}
                        >
                          {c.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {c.platform && (
                            <span className="chip bg-panel-2 text-[10px] uppercase tracking-wide text-ink-2">
                              {c.platform}
                            </span>
                          )}
                          {!c.supported && (
                            <span className="text-[10px] uppercase text-ink-3">no plugin</span>
                          )}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Filters */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-2">
                Date scope
              </p>
              <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-panel-border bg-panel-2/60 p-1">
                {(
                  [
                    { key: 'all', label: 'All postings' },
                    { key: 'today', label: "Today's postings" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDateScope(key)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      dateScope === key
                        ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-600/25'
                        : 'text-ink-2 hover:text-ink'
                    }`}
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    label: 'Keyword',
                    icon: Search,
                    value: keyword,
                    set: setKeyword,
                    placeholder: 'engineer, data…',
                    type: 'text',
                  },
                  {
                    label: 'Location',
                    icon: MapPin,
                    value: location,
                    set: setLocation,
                    placeholder: 'Bangalore…',
                    type: 'text',
                  },
                  {
                    label: 'Max jobs',
                    icon: Hash,
                    value: limit,
                    set: setLimit,
                    placeholder: '100',
                    type: 'number',
                  },
                ].map(({ label, icon: Icon, value, set, placeholder, type }) => (
                  <div key={label} className="flex flex-col gap-1.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-2">
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </p>
                    <input
                      type={type}
                      min={type === 'number' ? 1 : undefined}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      placeholder={placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Launch */}
            <button
              type="button"
              onClick={handleStart}
              disabled={!selected || starting || running}
              className="btn-primary w-full py-3"
            >
              {starting || running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {running ? 'Scraping…' : 'Starting…'}
                </>
              ) : activeRun && stepIndex === 3 ? (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Scrape complete — run again
                </>
              ) : (
                <>
                  <Radar className="h-4 w-4" />
                  {selected ? `Scrape ${selected.name}` : 'Select a company to scrape'}
                </>
              )}
            </button>

            {/* Live run status */}
            {activeRun && (
              <div className="rounded-xl border border-panel-border bg-panel-2/50 p-4 animate-fade-in">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">
                    {activeRun.company_name ?? activeRun.company_id}
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-ink-3">
                      {activeRun.platform}
                    </span>
                  </p>
                  <StatusChip status={activeRun.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <CounterTile label="Found" value={activeRun.stubs_seen} />
                  <CounterTile label="Fetched" value={activeRun.details_fetched} />
                  <CounterTile label="Saved" value={activeRun.matched} />
                  <CounterTile label="Errors" value={activeRun.errors} />
                </div>
                {activeRun.error_message && (
                  <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {activeRun.error_message}
                  </p>
                )}
                {stepIndex === 3 && (
                  <Link
                    to="/jobs"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-300 hover:text-brand-200"
                  >
                    View scraped jobs <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ---- Recent runs ---- */}
        <aside className="animate-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-2">
              Recent runs
            </p>
            {recentRuns.length === 0 ? (
              <p className="mt-4 text-sm text-ink-3">No scrape runs yet.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {recentRuns.map((run) => (
                  <li
                    key={run.id}
                    className="rounded-xl border border-panel-border bg-panel-2/50 px-3.5 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink">
                        {run.company_name ?? run.company_id}
                      </p>
                      <StatusChip status={run.status} />
                    </div>
                    <p className="mt-1.5 text-xs text-ink-3">
                      {run.matched} jobs · {new Date(run.started_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
