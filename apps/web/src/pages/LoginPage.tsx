import {
  ArrowRight,
  FileText,
  Loader2,
  Lock,
  Mail,
  Plane,
  Sparkles,
  Target,
  User,
  Zap,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

const FEATURES = [
  {
    icon: FileText,
    title: 'Parse your resume once',
    text: 'PDF or DOCX in — a structured, reusable profile out.',
  },
  {
    icon: Target,
    title: 'See your match instantly',
    text: 'Every job scored against your real skills before you click.',
  },
  {
    icon: Zap,
    title: 'Autofill applications',
    text: 'The Chrome extension fills Workday & Greenhouse forms for you.',
  },
];

export function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, fullName);
      }
      navigate('/dashboard', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Brand hero */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-panel p-12 lg:flex">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-600/25 blur-3xl" />
          <div className="absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-accent-500/15 blur-3xl" />
          <div className="absolute left-1/3 top-1/2 h-64 w-64 rounded-full bg-brand-400/10 blur-3xl" />
        </div>

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-glow">
            <Plane className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xl font-extrabold tracking-tight text-white">JobPilot</p>
            <p className="text-xs text-ink-2">Parse · Match · Apply</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white">
            Your co-pilot for the{' '}
            <span className="bg-gradient-to-r from-brand-300 to-accent-300 bg-clip-text text-transparent">
              job hunt
            </span>
          </h1>
          <p className="mt-4 text-ink-2">
            One profile powers everything — match scoring on every listing and one-click
            autofill on real application pages.
          </p>

          <div className="mt-10 space-y-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-panel-border bg-panel-2 text-brand-300">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-ink">{title}</p>
                  <p className="mt-0.5 text-sm text-ink-2">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-ink-3">
          Resume parser · Job scraper · JD match scoring · Chrome autofill — one workflow.
        </p>
      </div>

      {/* Auth card */}
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white">
              <Plane className="h-5 w-5" />
            </div>
            <p className="text-lg font-extrabold tracking-tight text-white">JobPilot</p>
          </div>

          <h2 className="text-2xl font-bold text-white">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            {mode === 'login'
              ? 'Sign in to continue to your dashboard.'
              : 'Free forever — takes less than a minute.'}
          </p>

          {/* Mode switch */}
          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-panel-border bg-panel-2/60 p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`rounded-lg py-2 text-sm font-semibold transition ${
                  mode === m
                    ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-600/25'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                {m === 'login' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === 'register' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="fullName">Full name</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                  <input
                    id="fullName"
                    className="w-full pl-10"
                    placeholder="Ada Lovelace"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <input
                  id="email"
                  type="email"
                  required
                  className="w-full pl-10"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  className="w-full pl-10"
                  placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === 'login' ? (
                <>
                  Sign in <ArrowRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  Create account <Sparkles className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-3">
            {mode === 'login' ? 'New to JobPilot? ' : 'Already have an account? '}
            <button
              type="button"
              className="font-semibold text-brand-300 hover:text-brand-200"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
            >
              {mode === 'login' ? 'Create an account' : 'Sign in instead'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
