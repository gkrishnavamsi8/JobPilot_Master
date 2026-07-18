import skillAliasesJson from '../data/skillAliases.json';
import type { Skill } from './skillsTaxonomy';
import { SKILLS_TAXONOMY } from './skillsTaxonomy';

export type SkillAliasMap = Partial<Record<Skill, string[]>>;

let cachedAliasMap: SkillAliasMap | null = null;

function buildValidatedAliasMap(): SkillAliasMap {
  const taxonomySet = new Set<string>(SKILLS_TAXONOMY);
  const validated: SkillAliasMap = {};

  for (const [skill, aliases] of Object.entries(skillAliasesJson)) {
    if (!taxonomySet.has(skill)) {
      continue;
    }

    validated[skill] = aliases.filter(
      (alias) => alias.trim().length > 0 && alias.toLowerCase() !== skill.toLowerCase(),
    );
  }

  return validated;
}

export function getSkillAliasMap(): SkillAliasMap {
  if (!cachedAliasMap) {
    cachedAliasMap = buildValidatedAliasMap();
  }

  return cachedAliasMap;
}

export function getSearchTermsForSkill(skill: Skill, aliasMap: SkillAliasMap = getSkillAliasMap()): string[] {
  const aliases = aliasMap[skill] ?? [];
  return [skill, ...aliases].sort((a, b) => b.length - a.length);
}

export function getAliasCount(): number {
  return Object.values(getSkillAliasMap()).reduce(
    (total, aliases = []) => total + aliases.length,
    0,
  );
}
