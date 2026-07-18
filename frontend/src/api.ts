import { authHeaders } from "./lib/authApi";
import type { CandidateData, ParsedResumeResult, SavedCandidate } from "./types";

const API = "/api/parser";

export async function parseResume(file: File): Promise<ParsedResumeResult> {
  const form = new FormData();
  form.append("resume", file);
  const res = await fetch(`${API}/resume/parse`, {
    method: "POST",
    body: form,
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to parse resume");
  }
  return res.json();
}

export async function saveCandidate(
  data: CandidateData,
  resume?: File | null,
): Promise<SavedCandidate> {
  const form = new FormData();
  form.append("candidate_json", JSON.stringify(data));
  if (resume) form.append("resume", resume);
  const res = await fetch(`${API}/candidates`, {
    method: "POST",
    body: form,
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === "string" ? err.detail : "Failed to save profile");
  }
  return res.json();
}

export interface MyCandidateResponse extends SavedCandidate {
  data: CandidateData;
}

export async function getMyCandidate(): Promise<MyCandidateResponse | null> {
  const res = await fetch(`${API}/candidates/me`, { headers: authHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load profile");
  return res.json();
}

export async function checkHealth(): Promise<{ database?: string }> {
  const res = await fetch(`${API}/health/db`);
  if (!res.ok) throw new Error("API unreachable");
  return res.json();
}
