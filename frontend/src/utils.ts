import type { CandidateData } from "./types";

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

function mergeDeep<T extends Record<string, unknown>>(base: T, patch: T): T {
  const out = { ...base };
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const pv = patch[key];
    const bv = base[key];
    if (isEmpty(bv) && !isEmpty(pv)) {
      out[key] = pv;
    } else if (
      pv &&
      bv &&
      typeof pv === "object" &&
      typeof bv === "object" &&
      !Array.isArray(pv) &&
      !Array.isArray(bv)
    ) {
      out[key] = mergeDeep(
        bv as Record<string, unknown>,
        pv as Record<string, unknown>,
      ) as T[keyof T];
    } else if (Array.isArray(pv) && Array.isArray(bv) && bv.length === 0 && pv.length > 0) {
      out[key] = pv;
    }
  }
  return out;
}

export function mergeParsed(current: CandidateData, parsed: CandidateData): CandidateData {
  return mergeDeep(
    current as Record<string, unknown>,
    parsed as Record<string, unknown>,
  ) as CandidateData;
}

export function skillsToString(skills?: string[]): string {
  return (skills ?? []).join(", ");
}

export function stringToSkills(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
