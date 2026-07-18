const CANDIDATE_ID_KEY = 'jobpilot_candidate_id';
const CANDIDATE_DATA_KEY = 'jobpilot_candidate_data';

export function getStoredCandidateId(): string | null {
  return localStorage.getItem(CANDIDATE_ID_KEY);
}

export function setStoredCandidate(id: string, data?: unknown): void {
  localStorage.setItem(CANDIDATE_ID_KEY, id);
  if (data !== undefined) {
    localStorage.setItem(CANDIDATE_DATA_KEY, JSON.stringify(data));
  }
}

export function getStoredCandidateData<T = unknown>(): T | null {
  const raw = localStorage.getItem(CANDIDATE_DATA_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearStoredCandidate(): void {
  localStorage.removeItem(CANDIDATE_ID_KEY);
  localStorage.removeItem(CANDIDATE_DATA_KEY);
}
