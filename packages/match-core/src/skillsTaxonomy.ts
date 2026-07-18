import skillsTaxonomy from './data/skillsTaxonomy.json';

export type Skill = string;

export const SKILLS_TAXONOMY: readonly Skill[] = skillsTaxonomy;

export function getSkillsTaxonomy(): readonly Skill[] {
  return SKILLS_TAXONOMY;
}
