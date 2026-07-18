import type { Education } from "./types";

const PROJECT_LINE =
  /^(projects?|project)$/i;
const PROJECT_CONTENT =
  /\b(engineered|developed|optimized|built|implemented|designed|kafka|redis|oauth|deployment|maintenance|authentication|platform|apis?)\b/i;
const INSTITUTION =
  /\b(university|college|institute|institution|school|academy|vit\b|iit\b|nit\b)/i;

/** Client-side safety net when PDF parsing returns noisy rows. */
export function sanitizeEducation(education: Education[]): Education[] {
  const filtered = education.filter((e) => {
    const school = (e.school || "").trim();
    if (!school && !e.degree) return false;
    if (PROJECT_LINE.test(school)) return false;
    if (PROJECT_CONTENT.test(school)) return false;
    if (e.degree || INSTITUTION.test(school)) return true;
    return false;
  });

  if (filtered.length <= 1) return filtered.slice(0, 1);

  const primary =
    filtered.find((e) => e.school && INSTITUTION.test(e.school)) || filtered[0];
  for (const row of filtered) {
    if (row === primary) continue;
    primary.degree = primary.degree || row.degree;
    primary.field_of_study = primary.field_of_study || row.field_of_study;
    primary.end_date = primary.end_date || row.end_date;
    primary.start_date = primary.start_date || row.start_date;
  }
  return [primary];
}
