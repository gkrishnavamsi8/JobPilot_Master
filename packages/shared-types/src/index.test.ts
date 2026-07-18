import { describe, expect, it } from 'vitest';
import { buildUserMatchText, formatJobKey, parseJobKey } from './index';

describe('jobKey', () => {
  it('formats and parses composite job keys', () => {
    const key = formatJobKey('nvidia', 'workday', 'JR123');
    expect(parseJobKey(key)).toEqual({
      companyId: 'nvidia',
      source: 'workday',
      jobId: 'JR123',
    });
  });
});

describe('buildUserMatchText', () => {
  it('builds text from full candidate profile', () => {
    const text = buildUserMatchText({
      profile: { summary: 'Engineer', skills: ['Java'] },
      work_experience: [{ title: 'Dev', description: 'APIs' }],
    });
    expect(text).toContain('Engineer');
    expect(text).toContain('Java');
    expect(text).toContain('Dev APIs');
  });
});
