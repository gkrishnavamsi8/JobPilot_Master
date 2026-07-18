import {
  Briefcase,
  GraduationCap,
  MessageSquare,
  Settings2,
  Shield,
  User,
} from "lucide-react";
import type { CandidateData } from "../types";
import { DEGREE_OPTIONS, WORK_AUTH_OPTIONS } from "../types";
import { Field, Section } from "./ui";

interface Props {
  data: CandidateData;
  filled: Set<string>;
  onChange: (data: CandidateData) => void;
}

function has(path: string, filled: Set<string>) {
  return filled.has(path);
}

export function CandidateForm({ data, filled, onChange }: Props) {
  const p = data.profile ?? {};
  const addr = p.address ?? {};
  const phone = p.phone ?? {};
  const social = p.social ?? {};
  const prefs = data.preferences ?? {};
  const auth = data.work_authorization;

  const setProfile = (patch: Partial<typeof p>) =>
    onChange({ ...data, profile: { ...p, ...patch } });

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Personal info"
        description="Required on virtually every job application"
        icon={<User className="h-5 w-5" />}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="First name" autoFilled={has("profile.first_name", filled)}>
            <input
              value={p.first_name ?? ""}
              onChange={(e) => setProfile({ first_name: e.target.value })}
            />
          </Field>
          <Field label="Last name" autoFilled={has("profile.last_name", filled)}>
            <input
              value={p.last_name ?? ""}
              onChange={(e) => setProfile({ last_name: e.target.value })}
            />
          </Field>
          <Field label="Email" autoFilled={has("profile.email", filled)}>
            <input
              type="email"
              value={p.email ?? ""}
              onChange={(e) => setProfile({ email: e.target.value })}
            />
          </Field>
          <Field label="Phone" autoFilled={has("profile.phone.number", filled)}>
            <input
              value={phone.number ?? ""}
              onChange={(e) =>
                setProfile({ phone: { ...phone, number: e.target.value, type: "mobile" } })
              }
            />
          </Field>
          <Field label="LinkedIn" autoFilled={has("profile.social.linkedin", filled)}>
            <input
              value={social.linkedin ?? ""}
              onChange={(e) => setProfile({ social: { ...social, linkedin: e.target.value } })}
            />
          </Field>
          <Field label="GitHub" autoFilled={has("profile.social.github", filled)}>
            <input
              value={social.github ?? ""}
              onChange={(e) => setProfile({ social: { ...social, github: e.target.value } })}
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1" autoFilled={has("profile.address.line1", filled)}>
            <input
              value={addr.line1 ?? ""}
              onChange={(e) =>
                setProfile({ address: { ...addr, line1: e.target.value } })
              }
            />
          </Field>
          <Field label="City" autoFilled={has("profile.address.city", filled)}>
            <input
              value={addr.city ?? ""}
              onChange={(e) => setProfile({ address: { ...addr, city: e.target.value } })}
            />
          </Field>
          <Field label="State" autoFilled={has("profile.address.state", filled)}>
            <input
              value={addr.state ?? ""}
              onChange={(e) => setProfile({ address: { ...addr, state: e.target.value } })}
            />
          </Field>
          <Field label="Postal code" autoFilled={has("profile.address.postal_code", filled)}>
            <input
              value={addr.postal_code ?? ""}
              onChange={(e) =>
                setProfile({ address: { ...addr, postal_code: e.target.value } })
              }
            />
          </Field>
          <Field label="Country" autoFilled={has("profile.address.country", filled)}>
            <input
              value={addr.country ?? ""}
              onChange={(e) =>
                setProfile({ address: { ...addr, country: e.target.value } })
              }
            />
          </Field>
          <Field label="Skills (comma-separated)" autoFilled={has("profile.skills", filled)} className="sm:col-span-2">
            <input
              value={(p.skills ?? []).join(", ")}
              onChange={(e) =>
                setProfile({
                  skills: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Field label="Professional summary" autoFilled={has("profile.summary", filled)} className="sm:col-span-2">
            <textarea
              rows={3}
              value={p.summary ?? ""}
              onChange={(e) => setProfile({ summary: e.target.value })}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Work experience"
        description="Employment history for application forms"
        icon={<Briefcase className="h-5 w-5" />}
      >
        {(data.work_experience ?? []).length === 0 && (
          <p className="mb-4 text-sm text-ink-3">No experience parsed — add manually below.</p>
        )}
        <div className="flex flex-col gap-4">
          {(data.work_experience ?? []).map((exp, i) => (
            <div key={i} className="rounded-xl border border-panel-border bg-panel-2/50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Job title">
                  <input
                    value={exp.title ?? ""}
                    onChange={(e) => {
                      const list = [...(data.work_experience ?? [])];
                      list[i] = { ...exp, title: e.target.value };
                      onChange({ ...data, work_experience: list });
                    }}
                  />
                </Field>
                <Field label="Company">
                  <input
                    value={exp.company ?? ""}
                    onChange={(e) => {
                      const list = [...(data.work_experience ?? [])];
                      list[i] = { ...exp, company: e.target.value };
                      onChange({ ...data, work_experience: list });
                    }}
                  />
                </Field>
                <Field label="Start date">
                  <input
                    type="date"
                    value={exp.start_date?.slice(0, 10) ?? ""}
                    onChange={(e) => {
                      const list = [...(data.work_experience ?? [])];
                      list[i] = { ...exp, start_date: e.target.value };
                      onChange({ ...data, work_experience: list });
                    }}
                  />
                </Field>
                <Field label="End date">
                  <input
                    type="date"
                    disabled={exp.is_current}
                    value={exp.end_date?.slice(0, 10) ?? ""}
                    onChange={(e) => {
                      const list = [...(data.work_experience ?? [])];
                      list[i] = { ...exp, end_date: e.target.value };
                      onChange({ ...data, work_experience: list });
                    }}
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Field
                  label="What you did there (from resume)"
                  autoFilled={has("work_experience", filled) && Boolean(exp.description)}
                >
                  <textarea
                    rows={4}
                    placeholder="Key responsibilities and achievements in this role…"
                    value={exp.description ?? ""}
                    onChange={(e) => {
                      const list = [...(data.work_experience ?? [])];
                      list[i] = { ...exp, description: e.target.value };
                      onChange({ ...data, work_experience: list });
                    }}
                  />
                </Field>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
                <input
                  type="checkbox"
                  checked={exp.is_current ?? false}
                  className="rounded border-panel-border"
                  onChange={(e) => {
                    const list = [...(data.work_experience ?? [])];
                    list[i] = { ...exp, is_current: e.target.checked, end_date: null };
                    onChange({ ...data, work_experience: list });
                  }}
                />
                Currently working here
              </label>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-4 text-sm font-semibold text-brand-300 hover:text-brand-200"
          onClick={() =>
            onChange({
              ...data,
              work_experience: [...(data.work_experience ?? []), { is_current: false }],
            })
          }
        >
          + Add experience
        </button>
      </Section>

      <Section
        title="Education"
        icon={<GraduationCap className="h-5 w-5" />}
      >
        <div className="flex flex-col gap-4">
          {(data.education ?? []).map((edu, i) => (
            <div key={i} className="rounded-xl border border-panel-border bg-panel-2/50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="School">
                  <input
                    value={edu.school ?? ""}
                    onChange={(e) => {
                      const list = [...(data.education ?? [])];
                      list[i] = { ...edu, school: e.target.value };
                      onChange({ ...data, education: list });
                    }}
                  />
                </Field>
                <Field label="Degree">
                  <select
                    value={edu.degree ?? ""}
                    onChange={(e) => {
                      const list = [...(data.education ?? [])];
                      list[i] = { ...edu, degree: e.target.value };
                      onChange({ ...data, education: list });
                    }}
                  >
                    <option value="">Select…</option>
                    {DEGREE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Field of study">
                  <input
                    value={edu.field_of_study ?? ""}
                    onChange={(e) => {
                      const list = [...(data.education ?? [])];
                      list[i] = { ...edu, field_of_study: e.target.value };
                      onChange({ ...data, education: list });
                    }}
                  />
                </Field>
                <Field label="Graduation date">
                  <input
                    type="date"
                    value={edu.end_date?.slice(0, 10) ?? ""}
                    onChange={(e) => {
                      const list = [...(data.education ?? [])];
                      list[i] = { ...edu, end_date: e.target.value };
                      onChange({ ...data, education: list });
                    }}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-4 text-sm font-semibold text-brand-300 hover:text-brand-200"
          onClick={() => onChange({ ...data, education: [...(data.education ?? []), {}] })}
        >
          + Add education
        </button>
      </Section>

      <Section
        title="Work authorization"
        description="Visa and sponsorship questions on most forms"
        icon={<Shield className="h-5 w-5" />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Authorization status">
            <select
              value={auth?.status ?? ""}
              onChange={(e) =>
                onChange({
                  ...data,
                  work_authorization: {
                    ...auth,
                    status: e.target.value,
                    requires_sponsorship_now: auth?.requires_sponsorship_now ?? false,
                  },
                })
              }
            >
              <option value="">Select…</option>
              {WORK_AUTH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Need sponsorship now?">
            <select
              value={
                auth?.requires_sponsorship_now === undefined
                  ? ""
                  : auth.requires_sponsorship_now
                    ? "yes"
                    : "no"
              }
              onChange={(e) =>
                onChange({
                  ...data,
                  work_authorization: {
                    status: auth?.status ?? "other",
                    ...auth,
                    requires_sponsorship_now:
                      e.target.value === "" ? null : e.target.value === "yes",
                  },
                })
              }
            >
              <option value="">Select…</option>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section
        title="Preferences"
        description="Salary, relocation, availability"
        icon={<Settings2 className="h-5 w-5" />}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Desired salary" autoFilled={has("preferences.desired_salary", filled)}>
            <input
              value={prefs.desired_salary ?? ""}
              onChange={(e) =>
                onChange({ ...data, preferences: { ...prefs, desired_salary: e.target.value } })
              }
            />
          </Field>
          <Field label="Years of experience" autoFilled={has("preferences.years_of_experience", filled)}>
            <input
              type="number"
              min={0}
              value={prefs.years_of_experience ?? ""}
              onChange={(e) =>
                onChange({
                  ...data,
                  preferences: {
                    ...prefs,
                    years_of_experience: e.target.value ? Number(e.target.value) : null,
                  },
                })
              }
            />
          </Field>
          <Field label="Available start date">
            <input
              type="date"
              value={prefs.available_start_date?.slice(0, 10) ?? ""}
              onChange={(e) =>
                onChange({
                  ...data,
                  preferences: { ...prefs, available_start_date: e.target.value },
                })
              }
            />
          </Field>
          <Field label="Willing to relocate">
            <select
              value={
                prefs.willing_to_relocate === undefined
                  ? ""
                  : prefs.willing_to_relocate
                    ? "yes"
                    : "no"
              }
              onChange={(e) =>
                onChange({
                  ...data,
                  preferences: {
                    ...prefs,
                    willing_to_relocate:
                      e.target.value === "" ? null : e.target.value === "yes",
                  },
                })
              }
            >
              <option value="">Select…</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="Remote preference">
            <select
              value={prefs.remote_preference ?? ""}
              onChange={(e) =>
                onChange({
                  ...data,
                  preferences: { ...prefs, remote_preference: e.target.value || null },
                })
              }
            >
              <option value="">Select…</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
              <option value="flexible">Flexible</option>
            </select>
          </Field>
          <Field label="Referral source">
            <input
              value={prefs.referral_source ?? ""}
              onChange={(e) =>
                onChange({
                  ...data,
                  preferences: { ...prefs, referral_source: e.target.value },
                })
              }
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Screening answers"
        description="Pre-written answers reused across applications"
        icon={<MessageSquare className="h-5 w-5" />}
      >
        {(data.custom_answers ?? []).map((qa, i) => (
          <div key={i} className="mb-4 grid gap-3">
            <Field label="Question">
              <input
                value={qa.question_text}
                onChange={(e) => {
                  const list = [...(data.custom_answers ?? [])];
                  list[i] = { ...qa, question_text: e.target.value };
                  onChange({ ...data, custom_answers: list });
                }}
              />
            </Field>
            <Field label="Your answer">
              <textarea
                rows={2}
                value={(qa.answer as string) ?? ""}
                onChange={(e) => {
                  const list = [...(data.custom_answers ?? [])];
                  list[i] = { ...qa, answer: e.target.value };
                  onChange({ ...data, custom_answers: list });
                }}
              />
            </Field>
          </div>
        ))}
        <button
          type="button"
          className="text-sm font-semibold text-brand-300 hover:text-brand-200"
          onClick={() =>
            onChange({
              ...data,
              custom_answers: [
                ...(data.custom_answers ?? []),
                { question_text: "", answer: "" },
              ],
            })
          }
        >
          + Add screening answer
        </button>
      </Section>
    </div>
  );
}
