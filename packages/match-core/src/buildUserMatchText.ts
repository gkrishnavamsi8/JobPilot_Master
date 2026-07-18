export interface MatchTextProfile {
  summary?: string | null;
  skills?: string[];
}

export interface MatchTextWorkExperience {
  title?: string | null;
  description?: string | null;
}

export interface MatchTextEducation {
  degree?: string | null;
  field_of_study?: string | null;
}

export interface MatchTextCandidate {
  profile?: MatchTextProfile | null;
  work_experience?: MatchTextWorkExperience[];
  education?: MatchTextEducation[];
  cover_letter?: string | null;
}

/** Build one string from all parsed profile sections for skill matching. */
export function buildUserMatchText(candidate: MatchTextCandidate): string {
  const parts: string[] = [];

  if (candidate.profile?.summary?.trim()) {
    parts.push(candidate.profile.summary.trim());
  }

  if (candidate.profile?.skills?.length) {
    parts.push(candidate.profile.skills.join(', '));
  }

  for (const role of candidate.work_experience ?? []) {
    const chunk = `${role.title ?? ''} ${role.description ?? ''}`.trim();
    if (chunk) {
      parts.push(chunk);
    }
  }

  for (const edu of candidate.education ?? []) {
    const chunk = `${edu.degree ?? ''} ${edu.field_of_study ?? ''}`.trim();
    if (chunk) {
      parts.push(chunk);
    }
  }

  if (candidate.cover_letter?.trim()) {
    parts.push(candidate.cover_letter.trim());
  }

  return parts.join('\n');
}
