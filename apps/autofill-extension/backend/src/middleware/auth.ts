import type { Request, Response, NextFunction } from 'express';

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const configuredKey = process.env.API_KEY;

  if (!configuredKey) {
    next();
    return;
  }

  const headerKey = req.header('x-api-key');
  const queryKey = typeof req.query.api_key === 'string' ? req.query.api_key : undefined;
  const providedKey = headerKey ?? queryKey;

  if (providedKey !== configuredKey) {
    res.status(401).json({ error: 'Invalid or missing API key' });
    return;
  }

  next();
}
