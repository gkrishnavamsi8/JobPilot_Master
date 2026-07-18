import { describe, expect, it } from 'vitest';
import { buildUserMatchText } from './buildUserMatchText';

describe('buildUserMatchText', () => {
  it('concatenates summary, skills, experience, and education', () => {
    const text = buildUserMatchText({
      profile: {
        summary: 'Backend engineer',
        skills: ['Java', 'Kafka'],
      },
      work_experience: [{ title: 'Engineer', description: 'Built microservices' }],
      education: [{ degree: 'BSc', field_of_study: 'CS' }],
      cover_letter: 'Excited to apply',
    });

    expect(text).toContain('Backend engineer');
    expect(text).toContain('Java, Kafka');
    expect(text).toContain('Engineer Built microservices');
    expect(text).toContain('BSc CS');
    expect(text).toContain('Excited to apply');
  });
});
