import { NavLink, Outlet } from 'react-router-dom';
import { Briefcase, Plane, UserCircle2 } from 'lucide-react';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/25'
      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
  }`;

export function AppLayout() {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-900/30 via-surface to-surface">
      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
              <Plane className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">JobPilot</h1>
              <p className="text-xs text-slate-400">Parse · Match · Apply</p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <NavLink to="/profile" className={linkClass}>
              <UserCircle2 className="h-4 w-4" />
              Profile
            </NavLink>
            <NavLink to="/jobs" className={linkClass}>
              <Briefcase className="h-4 w-4" />
              Jobs
            </NavLink>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
