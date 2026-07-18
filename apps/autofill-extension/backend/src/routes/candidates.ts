import { Router } from 'express';
import { getCandidateById, getCandidateByEmail, listCandidates, toApiResponse } from '../db.js';

export const candidatesRouter = Router();

const isDev = process.env.NODE_ENV !== 'production';

function errorPayload(error: unknown) {
  if (!isDev || !(error instanceof Error)) return { error: 'Internal server error' };
  return { error: 'Internal server error', message: error.message };
}

/** GET /candidates — lookup by ?email= or list recent candidates */
candidatesRouter.get('/', async (req, res) => {
  const email = typeof req.query.email === 'string' ? req.query.email : undefined;

  if (email) {
    try {
      const candidate = await getCandidateByEmail(email);
      if (!candidate) {
        res.status(404).json({ error: 'Candidate not found' });
        return;
      }
      res.json(toApiResponse(candidate));
    } catch (error) {
      console.error('GET /candidates?email failed', error);
      res.status(500).json(errorPayload(error));
    }
    return;
  }

  try {
    const candidates = await listCandidates(20);
    res.json({
      candidates: candidates.map((c) => ({
        id: c.id,
        email: c.email,
        first_name: c.first_name,
        last_name: c.last_name,
        updated_at: c.updated_at,
      })),
    });
  } catch (error) {
    console.error('GET /candidates list failed', error);
    res.status(500).json(errorPayload(error));
  }
});

/** GET /candidates/:id — fetch candidate profile data for the extension */
candidatesRouter.get('/:id', async (req, res) => {
  try {
    const candidate = await getCandidateById(req.params.id);
    if (!candidate) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }
    res.json(toApiResponse(candidate));
  } catch (error) {
    console.error('GET /candidates/:id failed', error);
    res.status(500).json(errorPayload(error));
  }
});
