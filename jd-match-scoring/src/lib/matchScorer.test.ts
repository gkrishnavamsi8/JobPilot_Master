import { describe, expect, it } from 'vitest';
import { extractSkills } from './skillExtractor';
import { computeMatchScore, computeWeightedMatchScore, getJdSectionTexts } from './matchScorer';
import { getSkillsTaxonomy } from './skillsTaxonomy';

const taxonomy = getSkillsTaxonomy();

describe('extractSkills', () => {
  it('does not match java inside javascript', () => {
    const skills = extractSkills('Expert in JavaScript and React', taxonomy);
    expect(skills.has('JavaScript')).toBe(true);
    expect(skills.has('Java')).toBe(false);
  });
});

describe('computeMatchScore', () => {
  it('returns strong overlap score', () => {
    const userSkills = extractSkills(
      'Senior engineer with Java, Spring Boot, Kafka, Docker, and AWS experience.',
      taxonomy,
    );
    const jdSkills = extractSkills(
      'Required: Java, Spring Boot, Kafka, Kubernetes, Python.',
      taxonomy,
    );

    const result = computeMatchScore(userSkills, jdSkills);

    expect(result.score).toBe(60);
    expect(result.matchedSkills).toEqual(['Java', 'Kafka', 'Spring Boot']);
    expect(result.missingSkills).toEqual(['Kubernetes', 'Python']);
  });

  it('returns zero score when there is no overlap', () => {
    const userSkills = extractSkills('Frontend developer using React and TypeScript.', taxonomy);
    const jdSkills = extractSkills('Backend role requiring Java and Spring Boot.', taxonomy);

    const result = computeMatchScore(userSkills, jdSkills);

    expect(result.score).toBe(0);
    expect(result.matchedSkills).toEqual([]);
    expect(result.missingSkills).toEqual(['Java', 'Spring Boot']);
  });

  it('handles empty JD skills without dividing by zero', () => {
    const userSkills = extractSkills('Python and SQL developer.', taxonomy);
    const jdSkills = extractSkills('No technical keywords here.', taxonomy);

    const result = computeMatchScore(userSkills, jdSkills);

    expect(result.score).toBe(0);
    expect(result.matchedSkills).toEqual([]);
    expect(result.missingSkills).toEqual([]);
  });
});

describe('computeWeightedMatchScore', () => {
  it('weights required skills higher than preferred skills', () => {
    const jdText = `
Required:
- Java
- Kafka

Nice to have:
- Python
- React
`;

    const userText = 'Experience with Java and Kafka.';
    const userSkills = extractSkills(userText, taxonomy);
    const allJdSkills = extractSkills(jdText, taxonomy);
    const { requiredText, preferredText } = getJdSectionTexts(jdText);
    const requiredSkills = extractSkills(requiredText || 'Java Kafka', taxonomy);
    const preferredSkills = extractSkills(preferredText || 'Python React', taxonomy);

    const basic = computeMatchScore(userSkills, allJdSkills);
    const weighted = computeWeightedMatchScore(
      userSkills,
      requiredSkills,
      preferredSkills,
      allJdSkills,
    );

    expect(basic.score).toBe(50);
    expect(weighted.weightedScore).toBe(66.7);
  });
});
