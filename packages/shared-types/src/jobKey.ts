export function formatJobKey(companyId: string, source: string, jobId: string): string {
  return `${companyId}:${source}:${jobId}`;
}

export function parseJobKey(key: string): { companyId: string; source: string; jobId: string } | null {
  const parts = key.split(':');
  if (parts.length < 3) {
    return null;
  }

  const [companyId, source, ...rest] = parts;
  return {
    companyId,
    source,
    jobId: rest.join(':'),
  };
}
