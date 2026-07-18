import {
  Briefcase,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Plane,
  UserCircle2,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/profile', label: 'Profile', icon: UserCircle2 },
  { to: '/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/applications', label: 'Applications', icon: ClipboardList },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
    isActive
      ? 'bg-gradient-to-r from-brand-600/90 to-brand-500/80 text-white shadow-lg shadow-brand-600/25'
      : 'text-ink-2 hover:bg-panel-2 hover:text-ink'
  }`;

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'U';
}

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="relative flex min-h-screen">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-48 left-1/4 h-96 w-[36rem] rounded-full bg-brand-700/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-accent-500/8 blur-3xl" />
      </div>

      {/* Sidebar */}
      <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-panel-border bg-panel/70 backdrop-blur-md md:w-60">
        <div className="flex items-center gap-3 px-3 py-5 md:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-glow">
            <Plane className="h-5 w-5" />
          </div>
          <div className="hidden md:block">
            <p className="text-base font-extrabold tracking-tight text-white">JobPilot</p>
            <p className="text-[11px] text-ink-3">Parse · Match · Apply</p>
          </div>
        </div>

        <nav className="mt-2 flex flex-1 flex-col gap-1 px-2 md:px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass} title={label}>
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="hidden md:inline">{label}</span>
            </NavLink>
          ))}
        </nav>

        {user && (
          <div className="border-t border-panel-border p-3">
            <div className="flex items-center gap-3 rounded-xl px-1.5 py-1.5 md:px-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/40 to-accent-500/30 text-xs font-bold text-brand-100">
                {initials(user.full_name, user.email)}
              </div>
              <div className="hidden min-w-0 flex-1 md:block">
                <p className="truncate text-sm font-semibold text-ink">
                  {user.full_name || user.email.split('@')[0]}
                </p>
                <p className="truncate text-[11px] text-ink-3">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                title="Sign out"
                className="hidden shrink-0 rounded-lg p-2 text-ink-3 transition hover:bg-panel-2 hover:text-red-400 md:block"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              className="mt-1 flex w-full items-center justify-center rounded-lg p-2 text-ink-3 transition hover:bg-panel-2 hover:text-red-400 md:hidden"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </aside>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
