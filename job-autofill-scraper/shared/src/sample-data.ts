const SAMPLE_CANDIDATE_DATA = {
  legal: {
    terms_accepted: true,
    marketing_opt_in: false,
    privacy_policy_accepted: true,
    background_check_consent: null,
  },
  profile: {
    email: 'jane.doe@example.com',
    phone: { type: 'mobile', number: '+1-555-010-9988', country_code: '+1' },
    skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
    social: {
      github: 'https://github.com/janedoe',
      linkedin: 'https://linkedin.com/in/janedoe',
      website: 'https://janedoe.dev',
    },
    address: {
      line1: '123 Market Street',
      line2: 'Apt 4B',
      city: 'San Francisco',
      state: 'California',
      country: 'United States',
      postal_code: '94105',
    },
    summary:
      'Full-stack engineer with 5+ years building scalable web applications and developer tools.',
    first_name: 'Jane',
    last_name: 'Doe',
    preferred_name: 'Jane',
  },
  education: [
    {
      school: 'State University',
      degree: 'Bachelor of Science',
      field_of_study: 'Computer Science',
      gpa: '3.8',
      start_date: '2015-09-01',
      end_date: '2019-05-15',
      is_current: false,
    },
  ],
  preferences: {
    desired_salary: 145000,
    salary_currency: 'USD',
    years_of_experience: 5,
    willing_to_relocate: true,
    remote_preference: 'hybrid',
  },
  work_experience: [
    {
      title: 'Senior Software Engineer',
      company: 'Acme Corp',
      location: 'San Francisco, CA',
      start_date: '2021-03-01',
      end_date: null,
      is_current: true,
      description: 'Led frontend platform migration to React and TypeScript.',
      employment_type: 'Full-time',
    },
    {
      title: 'Software Engineer',
      company: 'StartupXYZ',
      location: 'Remote',
      start_date: '2019-06-01',
      end_date: '2021-02-28',
      is_current: false,
      description: 'Built REST APIs and internal tooling with Node.js.',
      employment_type: 'Full-time',
    },
  ],
  cover_letter: null,
  custom_answers: [],
  additional_files: [],
};

export { SAMPLE_CANDIDATE_DATA };
