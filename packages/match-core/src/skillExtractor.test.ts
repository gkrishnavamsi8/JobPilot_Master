import { describe, expect, it } from 'vitest';
import { computeMatchScore } from './matchScorer';
import { extractSkills, getMatchedSkillsWithAliases } from './skillExtractor';
import { getAliasCount } from './skillAliases';
import { getSkillsTaxonomy } from './skillsTaxonomy';

const taxonomy = getSkillsTaxonomy();

describe('extractSkills', () => {
  it('does not match java inside javascript', () => {
    const skills = extractSkills('Expert in JavaScript and React', taxonomy);
    expect(skills.has('JavaScript')).toBe(true);
    expect(skills.has('Java')).toBe(false);
  });

  it('maps common aliases to canonical skills', () => {
    const skills = extractSkills(
      'Built platforms with K8s, JS, ReactJS, Postgres, and Amazon Web Services.',
      taxonomy,
    );

    expect(skills.has('Kubernetes')).toBe(true);
    expect(skills.has('JavaScript')).toBe(true);
    expect(skills.has('React')).toBe(true);
    expect(skills.has('PostgreSQL')).toBe(true);
    expect(skills.has('AWS')).toBe(true);
  });

  it('reports which alias was used for explainability', () => {
    const matches = getMatchedSkillsWithAliases('Experience with K8s and JS.', taxonomy);
    const kubernetes = matches.find((entry) => entry.skill === 'Kubernetes');
    const javascript = matches.find((entry) => entry.skill === 'JavaScript');

    expect(kubernetes?.matchedVia).toBe('K8s');
    expect(javascript?.matchedVia).toBe('JS');
  });

  it('loads a non-empty alias map', () => {
    expect(getAliasCount()).toBeGreaterThan(50);
  });
});

describe('alias-aware match scoring', () => {
  it('scores fairly when resume and JD use different wording', () => {
    const userSkills = extractSkills('Resume: K8s, JS, ReactJS, Amazon Web Services.', taxonomy);
    const jdSkills = extractSkills(
      'Required: Kubernetes, JavaScript, React, AWS.',
      taxonomy,
    );

    const result = computeMatchScore(userSkills, jdSkills);

    expect(result.score).toBe(100);
    expect(result.matchedSkills).toEqual(['AWS', 'JavaScript', 'Kubernetes', 'React']);
    expect(result.missingSkills).toEqual([]);
  });
});
