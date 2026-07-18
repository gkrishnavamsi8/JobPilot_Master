import { extractSkills } from './skillExtractor';
import {
  computeMatchScore,
  computeWeightedMatchScore,
  getJdSectionTexts,
  type MatchScoreResult,
  type WeightedMatchScoreResult,
} from './matchScorer';
import { getSkillsTaxonomy } from './skillsTaxonomy';

export interface AnalyzeMatchInput {
  professionalSummary: string;
  jobDescription: string;
  useWeightedScoring?: boolean;
}

export interface AnalyzeMatchOutput {
  userSkillCount: number;
  jdSkillCount: number;
  userSkills: string[];
  jdSkills: string[];
  result: MatchScoreResult;
  weightedResult?: WeightedMatchScoreResult;
}

const taxonomy = getSkillsTaxonomy();

export function analyzeMatch(input: AnalyzeMatchInput): AnalyzeMatchOutput {
  const userSkills = extractSkills(input.professionalSummary, taxonomy);
  const jdSkills = extractSkills(input.jobDescription, taxonomy);
  const result = computeMatchScore(userSkills, jdSkills);

  let weightedResult: WeightedMatchScoreResult | undefined;

  if (input.useWeightedScoring) {
    const { requiredText, preferredText } = getJdSectionTexts(input.jobDescription);
    const requiredSkills = extractSkills(requiredText, taxonomy);
    const preferredSkills = extractSkills(preferredText, taxonomy);

    weightedResult = computeWeightedMatchScore(
      userSkills,
      requiredSkills,
      preferredSkills,
      jdSkills,
    );
  }

  return {
    userSkillCount: userSkills.size,
    jdSkillCount: jdSkills.size,
    userSkills: [...userSkills].sort((a, b) => a.localeCompare(b)),
    jdSkills: [...jdSkills].sort((a, b) => a.localeCompare(b)),
    result,
    weightedResult,
  };
}

export { extractSkills, computeMatchScore, computeWeightedMatchScore, getSkillsTaxonomy };
