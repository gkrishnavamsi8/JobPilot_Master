import type { Skill } from './skillsTaxonomy';

export interface MatchScoreResult {
  score: number;
  matchedSkills: Skill[];
  missingSkills: Skill[];
}

export interface WeightedMatchScoreResult extends MatchScoreResult {
  weightedScore: number;
  requiredMatched: Skill[];
  requiredMissing: Skill[];
  preferredMatched: Skill[];
  preferredMissing: Skill[];
}

const REQUIRED_SECTION_PATTERN =
  /(?:^|\n)\s*(?:required|must[\s-]*have|minimum\s+qualifications|basic\s+qualifications|essential)[^\n]*\n([\s\S]*?)(?=(?:^|\n)\s*(?:nice\s+to\s+have|preferred|bonus|desired|optional|qualifications)[^\n]*\n|$)/gi;

const PREFERRED_SECTION_PATTERN =
  /(?:^|\n)\s*(?:nice\s+to\s+have|preferred|bonus|desired|optional)[^\n]*\n([\s\S]*?)(?=(?:^|\n)\s*(?:required|must[\s-]*have|minimum\s+qualifications|responsibilities|about)[^\n]*\n|$)/gi;

function sortSkills(skills: Iterable<Skill>): Skill[] {
  return [...skills].sort((a, b) => a.localeCompare(b));
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Compute match score as percentage of JD skills present in user skills.
 */
export function computeMatchScore(
  userSkills: Set<Skill>,
  jdSkills: Set<Skill>,
): MatchScoreResult {
  if (jdSkills.size === 0) {
    return {
      score: 0,
      matchedSkills: [],
      missingSkills: [],
    };
  }

  const matched = sortSkills([...jdSkills].filter((skill) => userSkills.has(skill)));
  const missing = sortSkills([...jdSkills].filter((skill) => !userSkills.has(skill)));
  const score = roundScore((matched.length / jdSkills.size) * 100);

  return {
    score,
    matchedSkills: matched,
    missingSkills: missing,
  };
}

function extractSectionText(jdText: string, pattern: RegExp): string {
  const sections: string[] = [];
  const regex = new RegExp(pattern.source, pattern.flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(jdText)) !== null) {
    if (match[1]?.trim()) {
      sections.push(match[1]);
    }
  }

  return sections.join('\n');
}

export interface WeightedSkillSets {
  requiredSkills: Set<Skill>;
  preferredSkills: Set<Skill>;
  otherSkills: Set<Skill>;
}

export function splitJdSkillSections(
  requiredSkills: Set<Skill>,
  preferredSkills: Set<Skill>,
  allJdSkills: Set<Skill>,
): WeightedSkillSets {
  const requiredOnly = new Set<Skill>();
  const preferredOnly = new Set<Skill>();
  const other = new Set<Skill>();

  for (const skill of allJdSkills) {
    const inRequired = requiredSkills.has(skill);
    const inPreferred = preferredSkills.has(skill);

    if (inRequired) {
      requiredOnly.add(skill);
    } else if (inPreferred) {
      preferredOnly.add(skill);
    } else {
      other.add(skill);
    }
  }

  return {
    requiredSkills: requiredOnly,
    preferredSkills: preferredOnly,
    otherSkills: other,
  };
}

/**
 * Weighted scoring: required skills count 2x, preferred 1x, uncategorized 1x.
 */
export function computeWeightedMatchScore(
  userSkills: Set<Skill>,
  requiredSkills: Set<Skill>,
  preferredSkills: Set<Skill>,
  allJdSkills: Set<Skill>,
  requiredWeight = 2,
  preferredWeight = 1,
): WeightedMatchScoreResult {
  const sections = splitJdSkillSections(requiredSkills, preferredSkills, allJdSkills);
  const basic = computeMatchScore(userSkills, allJdSkills);

  const requiredMatched = sortSkills(
    [...sections.requiredSkills].filter((skill) => userSkills.has(skill)),
  );
  const requiredMissing = sortSkills(
    [...sections.requiredSkills].filter((skill) => !userSkills.has(skill)),
  );
  const preferredMatched = sortSkills(
    [...sections.preferredSkills].filter((skill) => userSkills.has(skill)),
  );
  const preferredMissing = sortSkills(
    [...sections.preferredSkills].filter((skill) => !userSkills.has(skill)),
  );

  const totalWeight =
    sections.requiredSkills.size * requiredWeight +
    sections.preferredSkills.size * preferredWeight +
    sections.otherSkills.size * preferredWeight;

  if (totalWeight === 0) {
    return {
      ...basic,
      weightedScore: 0,
      requiredMatched,
      requiredMissing,
      preferredMatched,
      preferredMissing,
    };
  }

  const earnedWeight =
    requiredMatched.length * requiredWeight +
    preferredMatched.length * preferredWeight +
    sortSkills([...sections.otherSkills].filter((skill) => userSkills.has(skill))).length *
      preferredWeight;

  return {
    ...basic,
    weightedScore: roundScore((earnedWeight / totalWeight) * 100),
    requiredMatched,
    requiredMissing,
    preferredMatched,
    preferredMissing,
  };
}

export function getJdSectionTexts(jdText: string): { requiredText: string; preferredText: string } {
  return {
    requiredText: extractSectionText(jdText, REQUIRED_SECTION_PATTERN),
    preferredText: extractSectionText(jdText, PREFERRED_SECTION_PATTERN),
  };
}
