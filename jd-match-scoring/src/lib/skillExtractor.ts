import type { Skill } from './skillsTaxonomy';
import { getSearchTermsForSkill, getSkillAliasMap, type SkillAliasMap } from './skillAliases';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSkillPattern(term: string): RegExp {
  const escaped = escapeRegex(term);
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

function termMatchesText(term: string, text: string): boolean {
  return buildSkillPattern(term).test(text);
}

/**
 * Remove shorter skills subsumed by a longer matched skill (e.g. Spring inside Spring Boot).
 */
function filterSubsumedSkills(skills: Set<Skill>): Set<Skill> {
  const sorted = [...skills].sort((a, b) => b.length - a.length);
  const kept: Skill[] = [];

  for (const skill of sorted) {
    const subsumed = kept.some((longer) => termMatchesText(skill, longer));

    if (!subsumed) {
      kept.push(skill);
    }
  }

  return new Set(kept);
}

function skillMentionedInText(skill: Skill, text: string, aliasMap: SkillAliasMap): boolean {
  const searchTerms = getSearchTermsForSkill(skill, aliasMap);
  return searchTerms.some((term) => termMatchesText(term, text));
}

/**
 * Extract skills from text using word-boundary matching against the taxonomy.
 * Alternate names from the alias map resolve to canonical taxonomy skills.
 */
export function extractSkills(
  text: string,
  taxonomy: readonly Skill[],
  aliasMap: SkillAliasMap = getSkillAliasMap(),
): Set<Skill> {
  if (!text.trim()) {
    return new Set();
  }

  const sortedTaxonomy = [...taxonomy].sort((a, b) => b.length - a.length);
  const found = new Set<Skill>();

  for (const skill of sortedTaxonomy) {
    if (skillMentionedInText(skill, text, aliasMap)) {
      found.add(skill);
    }
  }

  return filterSubsumedSkills(found);
}

/**
 * Returns which alias (if any) matched for a skill in the given text.
 * Useful for explainability in the UI.
 */
export function getMatchedAliasForSkill(
  skill: Skill,
  text: string,
  aliasMap: SkillAliasMap = getSkillAliasMap(),
): string | null {
  if (termMatchesText(skill, text)) {
    return null;
  }

  const aliases = aliasMap[skill] ?? [];

  for (const alias of aliases) {
    if (termMatchesText(alias, text)) {
      return alias;
    }
  }

  return null;
}

export function getMatchedSkillsWithAliases(
  text: string,
  taxonomy: readonly Skill[],
  aliasMap: SkillAliasMap = getSkillAliasMap(),
): Array<{ skill: Skill; matchedVia: string | null }> {
  const skills = extractSkills(text, taxonomy, aliasMap);

  return [...skills]
    .sort((a, b) => a.localeCompare(b))
    .map((skill) => ({
      skill,
      matchedVia: getMatchedAliasForSkill(skill, text, aliasMap),
    }));
}
