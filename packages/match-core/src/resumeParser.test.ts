import { describe, expect, it } from 'vitest';
import { getResumeFormat, parseResumeFile } from './resumeParser';

describe('resumeParser', () => {
  it('detects supported resume formats', () => {
    expect(getResumeFormat('resume.pdf')).toBe('pdf');
    expect(getResumeFormat('resume.docx')).toBe('docx');
    expect(getResumeFormat('resume.txt')).toBe('txt');
    expect(getResumeFormat('resume.doc')).toBeNull();
  });

  it('parses plain text resumes', async () => {
    const file = new File(
      ['Senior engineer with Java, Kafka, Docker, and AWS experience.'],
      'resume.txt',
      { type: 'text/plain' },
    );

    const parsed = await parseResumeFile(file);

    expect(parsed.format).toBe('txt');
    expect(parsed.text).toContain('Java');
    expect(parsed.characterCount).toBeGreaterThan(0);
  });

  it('rejects unsupported resume formats', async () => {
    const file = new File(['legacy'], 'resume.doc', {
      type: 'application/msword',
    });

    await expect(parseResumeFile(file)).rejects.toThrow(/Unsupported file type/i);
  });
});
