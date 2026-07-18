import { useMemo, useRef, useState } from 'react';
import {
  analyzeMatch,
  getMatchedAliasForSkill,
  type AnalyzeMatchOutput,
} from '@jobpilot/match-core';
import {
  getSupportedResumeExtensions,
  parseResumeFile,
} from '@jobpilot/match-core/resumeParser';

const SAMPLE_SUMMARY = `Senior Software Engineer with 8+ years building distributed systems.
Strong in Java, Spring Boot, Kafka, Docker, AWS, and microservices architecture.
Experienced with CI/CD, PostgreSQL, Redis, and REST API design.
Comfortable leading code reviews, mentoring teams, and working in Agile environments.`;

const SAMPLE_JD = `Senior Backend Engineer

Required:
- Java and Spring Boot
- Kafka and event-driven architecture
- Docker and Kubernetes
- AWS (EC2, S3, RDS)
- SQL and PostgreSQL

Nice to have:
- Python
- Machine Learning
- GraphQL
- Terraform

We value strong communication, problem solving, and cross-functional collaboration.`;

function ScoreRing({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className="score-ring-wrap">
      <div className="score-ring" style={{ ['--progress' as string]: clamped }}>
        <div className="score-ring-inner">
          <div>
            <div className="score-value">{value.toFixed(1)}%</div>
            <div className="score-label">{label}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkillList({
  skills,
  emptyLabel,
  resumeText,
}: {
  skills: string[];
  emptyLabel: string;
  resumeText?: string;
}) {
  if (skills.length === 0) {
    return <div className="empty-state">{emptyLabel}</div>;
  }

  return (
    <div className="skill-tags">
      {skills.map((skill) => {
        const matchedVia = resumeText ? getMatchedAliasForSkill(skill, resumeText) : null;

        return (
          <span key={skill} className="skill-tag" title={matchedVia ? `Detected via "${matchedVia}"` : undefined}>
            {skill}
            {matchedVia ? <span className="skill-alias"> via {matchedVia}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

function ResultsView({
  analysis,
  useWeighted,
  resumeText,
}: {
  analysis: AnalyzeMatchOutput;
  useWeighted: boolean;
  resumeText: string;
}) {
  const displayScore = useWeighted && analysis.weightedResult
    ? analysis.weightedResult.weightedScore
    : analysis.result.score;

  return (
    <section className="panel results-panel">
      <div className="score-card">
        <ScoreRing
          value={displayScore}
          label={useWeighted && analysis.weightedResult ? 'Weighted match' : 'Basic match'}
        />

        <div>
          <div className="stats-row">
            <div className="stat-pill">
              <strong>{analysis.userSkillCount}</strong> skills in your resume
            </div>
            <div className="stat-pill">
              <strong>{analysis.jdSkillCount}</strong> skills in the JD
            </div>
            <div className="stat-pill">
              <strong>{analysis.result.matchedSkills.length}</strong> matched
            </div>
            <div className="stat-pill">
              <strong>{analysis.result.missingSkills.length}</strong> missing
            </div>
          </div>

          {useWeighted && analysis.weightedResult && (
            <div className="weighted-note">
              Basic score: <strong>{analysis.result.score.toFixed(1)}%</strong> · Weighted score:{' '}
              <strong>{analysis.weightedResult.weightedScore.toFixed(1)}%</strong> (required skills
              weighted 2x)
            </div>
          )}

          <div className="skill-sections">
            <div className="skill-section matched">
              <h3>Matched skills ({analysis.result.matchedSkills.length})</h3>
              <SkillList
                skills={analysis.result.matchedSkills}
                emptyLabel="No overlapping skills found."
                resumeText={resumeText}
              />
            </div>

            <div className="skill-section missing">
              <h3>Missing skills ({analysis.result.missingSkills.length})</h3>
              <SkillList
                skills={analysis.result.missingSkills}
                emptyLabel="No missing skills — great fit on paper."
              />
            </div>

            {useWeighted && analysis.weightedResult && (
              <>
                <div className="skill-section matched">
                  <h3>Required matched ({analysis.weightedResult.requiredMatched.length})</h3>
                  <SkillList
                    skills={analysis.weightedResult.requiredMatched}
                    emptyLabel="No required skills matched."
                  />
                </div>

                <div className="skill-section missing">
                  <h3>Required missing ({analysis.weightedResult.requiredMissing.length})</h3>
                  <SkillList
                    skills={analysis.weightedResult.requiredMissing}
                    emptyLabel="All required skills covered."
                  />
                </div>

                <div className="skill-section preferred">
                  <h3>Preferred matched ({analysis.weightedResult.preferredMatched.length})</h3>
                  <SkillList
                    skills={analysis.weightedResult.preferredMatched}
                    emptyLabel="No preferred skills matched."
                  />
                </div>

                <div className="skill-section preferred">
                  <h3>Preferred missing ({analysis.weightedResult.preferredMissing.length})</h3>
                  <SkillList
                    skills={analysis.weightedResult.preferredMissing}
                    emptyLabel="All preferred skills covered."
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [professionalSummary, setProfessionalSummary] = useState(SAMPLE_SUMMARY);
  const [jobDescription, setJobDescription] = useState(SAMPLE_JD);
  const [useWeightedScoring, setUseWeightedScoring] = useState(true);
  const [hasAnalyzed, setHasAnalyzed] = useState(true);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const supportedFormats = getSupportedResumeExtensions().join(', ');

  const handleResumeUpload = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    setIsParsingResume(true);
    setResumeError(null);

    try {
      const parsed = await parseResumeFile(file);
      setProfessionalSummary(parsed.text);
      setResumeFileName(parsed.fileName);
      setHasAnalyzed(false);
    } catch (error) {
      setResumeError(error instanceof Error ? error.message : 'Failed to parse resume file.');
      setResumeFileName(null);
    } finally {
      setIsParsingResume(false);
      if (resumeInputRef.current) {
        resumeInputRef.current.value = '';
      }
    }
  };

  const analysis = useMemo(
    () =>
      analyzeMatch({
        professionalSummary,
        jobDescription,
        useWeightedScoring,
      }),
    [professionalSummary, jobDescription, useWeightedScoring],
  );

  const canAnalyze = professionalSummary.trim().length > 0 && jobDescription.trim().length > 0;

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-badge">JobPilot · JD Match Scoring</div>
        <h1>See how well your profile matches a job description</h1>
        <p>
          Upload your full resume or paste a summary, then add a job description to get an
          explainable keyword overlap score — no AI calls, fast and transparent.
        </p>
      </header>

      <div className="layout-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Resume / professional summary</h2>
            <p>Upload a full resume file or paste text. Skills are extracted from all content.</p>
          </div>
          <div className="panel-body">
            <div
              className={`upload-zone${isParsingResume ? ' is-loading' : ''}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void handleResumeUpload(event.dataTransfer.files[0]);
              }}
            >
              <input
                ref={resumeInputRef}
                id="resume-upload"
                className="upload-input"
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={(event) => void handleResumeUpload(event.target.files?.[0])}
              />
              <label htmlFor="resume-upload" className="upload-label">
                <strong>{isParsingResume ? 'Parsing resume…' : 'Upload resume file'}</strong>
                <span>Supported: {supportedFormats}</span>
              </label>
              {resumeFileName && !resumeError && (
                <div className="upload-meta">Loaded: {resumeFileName}</div>
              )}
              {resumeError && <div className="upload-error">{resumeError}</div>}
            </div>

            <textarea
              value={professionalSummary}
              onChange={(event) => {
                setHasAnalyzed(false);
                setResumeFileName(null);
                setResumeError(null);
                setProfessionalSummary(event.target.value);
              }}
              placeholder="Or paste your resume text here..."
              aria-label="Resume or professional summary"
            />
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Job description</h2>
            <p>Required and preferred sections improve weighted scoring.</p>
          </div>
          <div className="panel-body">
            <textarea
              value={jobDescription}
              onChange={(event) => {
                setHasAnalyzed(false);
                setJobDescription(event.target.value);
              }}
              placeholder="Paste the full job description here..."
              aria-label="Job description"
            />
          </div>
        </section>
      </div>

      <div className="controls">
        <label className="toggle">
          <input
            type="checkbox"
            checked={useWeightedScoring}
            onChange={(event) => setUseWeightedScoring(event.target.checked)}
          />
          Use weighted scoring (required skills count 2x)
        </label>

        <button
          className="primary-button"
          disabled={!canAnalyze}
          onClick={() => setHasAnalyzed(true)}
        >
          Calculate match score
        </button>
      </div>

      {hasAnalyzed && canAnalyze && (
        <ResultsView
          analysis={analysis}
          useWeighted={useWeightedScoring}
          resumeText={professionalSummary}
        />
      )}
    </div>
  );
}
