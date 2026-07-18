import { useEffect, useState } from 'react';
import { getMyCandidate } from '../api';
import type { CandidateData } from '../types';
import { getStoredCandidateData, getStoredCandidateId, setStoredCandidate } from './session';

export interface CandidateState {
  candidateId: string | null;
  candidateData: CandidateData | null;
  loading: boolean;
}

/** Saved profile for the signed-in user: localStorage cache first, API fallback. */
export function useCandidate(): CandidateState {
  const [state, setState] = useState<CandidateState>(() => {
    const id = getStoredCandidateId();
    const data = getStoredCandidateData<CandidateData>();
    return { candidateId: id, candidateData: data, loading: !(id && data) };
  });

  useEffect(() => {
    if (state.candidateId && state.candidateData) return;
    let cancelled = false;
    getMyCandidate()
      .then((record) => {
        if (cancelled) return;
        if (record) {
          setStoredCandidate(record.id, record.data);
          setState({ candidateId: record.id, candidateData: record.data, loading: false });
        } else {
          setState((s) => ({ ...s, loading: false }));
        }
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
