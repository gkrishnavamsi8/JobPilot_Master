import type { ScrapedJob } from '@jobpilot/shared-types';

/**
 * Demo dataset shown ONLY when the scraper API is unreachable, so the whole
 * flow (browse → match preview → apply logging) stays demonstrable locally.
 * The UI labels these rows as sample data; detail URLs point at example.com.
 */
export const SAMPLE_JOBS: ScrapedJob[] = [
  {
    company_id: 'nvidia',
    source: 'sample',
    job_id: 'demo-001',
    title: 'Senior Backend Engineer',
    location: 'Bangalore, India',
    country: 'India',
    date_posted: '2026-07-14',
    detail_url: 'https://example.com/careers/nvidia/senior-backend-engineer',
    employment_type: 'Full time',
    hiring_org: 'NVIDIA',
    description:
      'We are looking for a Senior Backend Engineer with strong experience in Java, Spring Boot, and Kafka. ' +
      'Required skills: Java, Kafka, AWS, PostgreSQL, Docker, Kubernetes, REST APIs, microservices. ' +
      'Nice to have: Terraform, Redis, gRPC, CI/CD with Jenkins or GitHub Actions.',
  },
  {
    company_id: 'astrazeneca',
    source: 'sample',
    job_id: 'demo-002',
    title: 'Full Stack Developer',
    location: 'Chennai, India',
    country: 'India',
    date_posted: '2026-07-15',
    detail_url: 'https://example.com/careers/astrazeneca/full-stack-developer',
    employment_type: 'Full time',
    hiring_org: 'AstraZeneca',
    description:
      'Full Stack Developer to build patient-facing web applications. ' +
      'Required: JavaScript, TypeScript, React, Node.js, Express, SQL, Git. ' +
      'Preferred: Next.js, GraphQL, Tailwind CSS, Azure, unit testing with Jest.',
  },
  {
    company_id: 'workday-demo',
    source: 'sample',
    job_id: 'demo-003',
    title: 'Data Engineer',
    location: 'Hyderabad, India',
    country: 'India',
    date_posted: '2026-07-16',
    detail_url: 'https://example.com/careers/workday/data-engineer',
    employment_type: 'Full time',
    hiring_org: 'Workday',
    description:
      'Data Engineer to design and operate batch and streaming pipelines. ' +
      'Required skills: Python, SQL, Apache Spark, Airflow, AWS (S3, Glue, Redshift), data modeling. ' +
      'Bonus: Kafka, dbt, Snowflake, Terraform.',
  },
  {
    company_id: 'greenhouse-demo',
    source: 'sample',
    job_id: 'demo-004',
    title: 'Machine Learning Engineer',
    location: 'Remote',
    country: 'United States',
    date_posted: '2026-07-13',
    detail_url: 'https://example.com/careers/greenhouse/ml-engineer',
    employment_type: 'Full time',
    hiring_org: 'Greenhouse Labs',
    description:
      'Machine Learning Engineer to productionize models end to end. ' +
      'Required: Python, PyTorch or TensorFlow, scikit-learn, MLOps, Docker, Kubernetes, AWS or GCP. ' +
      'Preferred: LLM fine-tuning, vector databases, FastAPI, monitoring with Prometheus.',
  },
  {
    company_id: 'nvidia',
    source: 'sample',
    job_id: 'demo-005',
    title: 'Frontend Engineer — Design Systems',
    location: 'Pune, India',
    country: 'India',
    date_posted: '2026-07-17',
    detail_url: 'https://example.com/careers/nvidia/frontend-engineer',
    employment_type: 'Full time',
    hiring_org: 'NVIDIA',
    description:
      'Frontend Engineer focused on design systems and component libraries. ' +
      'Required: React, TypeScript, CSS, HTML, accessibility (WCAG), Storybook, testing with Vitest or Jest. ' +
      'Nice to have: Figma, Tailwind CSS, animation, Vite, monorepo tooling.',
  },
  {
    company_id: 'astrazeneca',
    source: 'sample',
    job_id: 'demo-006',
    title: 'DevOps Engineer',
    location: 'Bangalore, India',
    country: 'India',
    date_posted: '2026-07-12',
    detail_url: 'https://example.com/careers/astrazeneca/devops-engineer',
    employment_type: 'Full time',
    hiring_org: 'AstraZeneca',
    description:
      'DevOps Engineer to own CI/CD and cloud infrastructure. ' +
      'Required: Kubernetes, Docker, Terraform, AWS, Linux, Bash, GitHub Actions or Jenkins, monitoring. ' +
      'Preferred: Helm, ArgoCD, Python scripting, security scanning.',
  },
  {
    company_id: 'workday-demo',
    source: 'sample',
    job_id: 'demo-007',
    title: 'QA Automation Engineer',
    location: 'Chennai, India',
    country: 'India',
    date_posted: '2026-07-11',
    detail_url: 'https://example.com/careers/workday/qa-automation',
    employment_type: 'Full time',
    hiring_org: 'Workday',
    description:
      'QA Automation Engineer to build test frameworks for web applications. ' +
      'Required: Selenium or Playwright, Java or Python, API testing, SQL, Git, Agile. ' +
      'Preferred: performance testing with JMeter, CI/CD integration, TypeScript.',
  },
  {
    company_id: 'greenhouse-demo',
    source: 'sample',
    job_id: 'demo-008',
    title: 'Product Data Analyst',
    location: 'Remote',
    country: 'India',
    date_posted: '2026-07-16',
    detail_url: 'https://example.com/careers/greenhouse/product-analyst',
    employment_type: 'Contract',
    hiring_org: 'Greenhouse Labs',
    description:
      'Product Data Analyst to turn product telemetry into decisions. ' +
      'Required: SQL, Python or R, Excel, dashboarding with Tableau or Power BI, A/B testing, statistics. ' +
      'Preferred: dbt, BigQuery, stakeholder communication.',
  },
];
