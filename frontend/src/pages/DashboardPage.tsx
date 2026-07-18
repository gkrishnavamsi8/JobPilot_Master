import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Chrome,
  ClipboardList,
  Eye,
  FileText,
  Send,
  Target,
  UserCircle2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchApplications, type JobApplication } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { useCandidate } from '../lib/useCandidate';
import type { CandidateData } from '../types';

function profileCompleteness(data: CandidateData | null): number {
  if (!data) return 0;
  const p = data.profile ?? {};
  const checks = [
    Boolean(p.first_name),
    Boolean(p.last_name),
    Boolean(p.email),
    Boolean(p.phone?.number),
    Boolean(p.summary),
    (p.skills?.length ?? 0) >= 3,
    (data.work_experience?.length ?? 0) > 0,
    (data.education?.length ?? 0) > 0,
    Boolean(data.work_authorization?.status),
    Boolean(data.preferences?.remote_preference || data.preferences?.desired_salary),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function DashboardPage() {
  const { user } = useAuth();
  const { candidateId, candidateData } = useCandidate();
  const [applications, setApplications] = useState<JobApplication[]>([]);

  useEffect(() => {
    fetchApplications()
      .then(setApplications)
      .catch(() => setApplications([]));
  }, []);

  const completeness = useMemo(() => profileCompleteness(candidateData), [candidateData]);
  const appliedCount = applications.filter((a) => a.status === 'applied').length;
  const viewedCount = applications.filter((a) => a.status === 'viewed').length;

  const firstName =
    candidateData?.profile?.first_name || user?.full_name?.split(' ')[0] || 'there';

  const steps = [
    {
      icon: FileText,
      title: 'Upload your resume',
      text: 'Parsed into a structured profile.',
      done: Boolean(candidateId),
      to: '/profile',
      cta: candidateId ? 'Edit profile' : 'Start here',
    },
    {
      icon: Target,
      title: 'Browse scored jobs',
      text: 'Match preview on every listing.',
      done: viewedCount + appliedCount > 0,
      to: '/jobs',
      cta: 'Open job browser',
    },
    {
      icon: Send,
      title: 'Apply & track',
      text: 'One click opens the ATS page.',
      done: appliedCount > 0,
      to: '/applications',
      cta: 'View applications',
    },
    {
      icon: Chrome,
      title: 'Autofill with the extension',
      text: 'Match overlay + form autofill on Workday & Greenhouse.',
      done: false,
      to: null,
      cta: 'Load from job-autofill-scraper/extension',
    },
  ];

  const stats = [
    {
      icon: UserCircle2,
      label: 'Profile complete',
      value: `${completeness}%`,
      sub: candidateId ? 'saved & ready' : 'not saved yet',
      to: '/profile',
    },
    {
      icon: Briefcase,
      label: 'Jobs viewed',
      value: String(viewedCount + appliedCount),
      sub: 'opened from the browser',
      to: '/jobs',
    },
    {
      icon: CheckCircle2,
      label: 'Applied',
      value: String(appliedCount),
      sub: 'marked as applied',
      to: '/applications',
    },
    {
      icon: Eye,
      label: 'In review',
      value: String(viewedCount),
      sub: 'viewed, not applied yet',
      to: '/applications',
    },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 animate-fade-up">
        <h2 className="text-3xl font-extrabold tracking-tight text-white">
          Hey {firstName} 👋
        </h2>
        <p className="mt-1.5 text-ink-2">
          Here's where your job hunt stands today.
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ icon: Icon, label, value, sub, to }, i) => (
          <Link
            key={label}
            to={to}
            className="card group p-5 transition hover:border-brand-500/40 animate-fade-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">
                {label}
              </span>
              <Icon className="h-4 w-4 text-ink-3 transition group-hover:text-brand-300" />
            </div>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-ink">{value}</p>
            <p className="mt-1 text-xs text-ink-3">{sub}</p>
          </Link>
        ))}
      </div>

      {/* Profile completeness bar */}
      <div className="card mt-6 p-6 animate-fade-up" style={{ animationDelay: '240ms' }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-white">Profile strength</h3>
            <p className="mt-0.5 text-sm text-ink-2">
              A complete profile improves match accuracy and autofill coverage.
            </p>
          </div>
          <Link to="/profile" className="btn-ghost">
            Improve it <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-panel-2">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-400 transition-all duration-700"
            style={{ width: `${completeness}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-ink-3">{completeness}% complete</p>
      </div>

      {/* Workflow steps */}
      <h3 className="mb-4 mt-10 text-lg font-bold text-white animate-fade-up">
        The JobPilot workflow
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        {steps.map(({ icon: Icon, title, text, done, to, cta }, i) => {
          const body = (
            <>
              <div className="flex items-start justify-between">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                    done
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-brand-500/15 text-brand-300'
                  }`}
                >
                  {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                <span className="text-[11px] font-bold text-ink-3">STEP {i + 1}</span>
              </div>
              <h4 className="mt-4 font-semibold text-ink">{title}</h4>
              <p className="mt-1 text-sm text-ink-2">{text}</p>
              <p
                className={`mt-3 inline-flex items-center gap-1.5 text-sm font-semibold ${
                  to ? 'text-brand-300 group-hover:text-brand-200' : 'text-ink-3'
                }`}
              >
                {cta} {to && <ArrowRight className="h-3.5 w-3.5" />}
              </p>
            </>
          );
          return to ? (
            <Link
              key={title}
              to={to}
              className="card group p-6 transition hover:border-brand-500/40 animate-fade-up"
              style={{ animationDelay: `${300 + i * 60}ms` }}
            >
              {body}
            </Link>
          ) : (
            <div
              key={title}
              className="card p-6 animate-fade-up"
              style={{ animationDelay: `${300 + i * 60}ms` }}
            >
              {body}
            </div>
          );
        })}
      </div>

      {/* Extension hint */}
      <div
        className="card mt-6 flex flex-wrap items-center justify-between gap-4 border-brand-500/20 bg-gradient-to-r from-brand-900/40 to-panel p-6 animate-fade-up"
        style={{ animationDelay: '540ms' }}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h4 className="font-semibold text-white">Chrome extension completes the loop</h4>
            <p className="mt-0.5 text-sm text-ink-2">
              Build it with <code className="rounded bg-panel-2 px-1.5 py-0.5 text-xs">npm run build:extension</code>,
              then load <code className="rounded bg-panel-2 px-1.5 py-0.5 text-xs">job-autofill-scraper/extension</code> unpacked
              — it shows the match overlay and autofills applications.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
