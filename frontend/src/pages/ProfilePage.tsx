import {
  CheckCircle2,
  Loader2,
  Save,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { checkHealth, parseResume, saveCandidate } from '../api';
import { CandidateForm } from '../components/CandidateForm';
import { ResumeUpload } from '../components/ResumeUpload';
import { setStoredCandidate } from '../lib/session';
import { emptyCandidate, type CandidateData } from '../types';
import { sanitizeEducation } from '../educationUtils';

export function ProfilePage() {
  const [data, setData] = useState<CandidateData>(emptyCandidate);
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [parseKey, setParseKey] = useState(0);

  useEffect(() => {
    checkHealth()
      .then((h) => setOnline(h.database === 'postgres' || h.database === 'sqlite'))
      .catch(() => setOnline(false));
  }, []);

  const handleResume = useCallback(async (file: File) => {
    setError(null);
    setSuccess(null);
    setResumeFile(file);
    setParsing(true);
    try {
      const result = await parseResume(file);
      const base = emptyCandidate();
      const parsed = result.extracted;
      const profile = parsed.profile ?? {};

      setData({
        ...base,
        profile: {
          ...base.profile,
          ...profile,
          phone: { ...base.profile?.phone, ...profile.phone },
          address: { ...base.profile?.address, ...profile.address },
          social: { ...base.profile?.social, ...profile.social },
          skills: profile.skills ?? [],
        },
        work_experience: parsed.work_experience ?? [],
        education: sanitizeEducation(parsed.education ?? []),
        preferences: { ...base.preferences, ...parsed.preferences },
        custom_answers: parsed.custom_answers?.length ? parsed.custom_answers : base.custom_answers,
        metadata: parsed.metadata ?? {},
      });
      setFilled(new Set(result.filled_fields));
      setParseKey((k) => k + 1);

      if (result.filled_fields.length < 3) {
        setError(
          'Very little text was detected in this resume. If it is a scanned PDF, try exporting a text-based PDF or upload DOCX.',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parse failed');
    } finally {
      setParsing(false);
    }
  }, []);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const payload = { ...data };
      if (payload.work_authorization && !payload.work_authorization.status) {
        delete (payload as { work_authorization?: unknown }).work_authorization;
      }
      const saved = await saveCandidate(payload, resumeFile);
      setStoredCandidate(saved.id, payload);
      setSuccess(saved.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Your profile</h2>
          <p className="mt-1 text-sm text-slate-400">
            Upload your resume once — used for match scoring and extension autofill.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {online === null ? null : online ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <Wifi className="h-3.5 w-3.5" /> DB connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <WifiOff className="h-3.5 w-3.5" /> API offline
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-500 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save profile
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Profile saved — ready for Jobs and extension autofill</p>
            <p className="mt-0.5 text-emerald-300/80">
              ID: <code className="rounded bg-emerald-950/50 px-1.5 py-0.5">{success}</code>
            </p>
          </div>
        </div>
      )}

      <div className="mb-8">
        <ResumeUpload onFile={handleResume} loading={parsing} fileName={resumeFile?.name} />
        {filled.size > 0 && (
          <p className="mt-3 text-center text-sm text-emerald-400">
            {filled.size} fields auto-filled from resume — review and complete the rest
          </p>
        )}
      </div>

      <CandidateForm key={parseKey} data={data} filled={filled} onChange={setData} />
    </main>
  );
}
