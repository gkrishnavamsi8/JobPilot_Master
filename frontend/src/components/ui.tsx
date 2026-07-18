import type { ReactNode } from "react";

interface Props {
  label: string;
  children: ReactNode;
  autoFilled?: boolean;
  className?: string;
}

export function Field({ label, children, autoFilled, className = "" }: Props) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-2">
        <label>{label}</label>
        {autoFilled && <span className="autofill-badge">Auto-filled</span>}
      </div>
      {children}
    </div>
  );
}

interface SectionProps {
  title: string;
  description?: string;
  icon: ReactNode;
  children: ReactNode;
}

export function Section({ title, description, icon, children }: SectionProps) {
  return (
    <section className="section-card">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-400">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-400">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
