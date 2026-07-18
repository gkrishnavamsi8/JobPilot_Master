import type { CandidateData } from './types';

export function buildUserMatchText(candidate: CandidateData): string {
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
