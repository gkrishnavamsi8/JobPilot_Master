import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidatesRouter } from './routes/candidates.js';
import { requireApiKey } from './middleware/auth.js';
import { closePool, getDatabaseMode } from './db.js';
import { SAMPLE_CANDIDATE_DATA } from '../../shared/dist/sample-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '../..');
const testDir = path.join(rootDir, 'test');

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', database: getDatabaseMode() });
});

app.get('/sample-data', (_req, res) => {
  res.json({ data: SAMPLE_CANDIDATE_DATA });
});

app.get('/', (_req, res) => {
  res.redirect('/workday-mock.html');
});

app.use(express.static(testDir));

app.use('/candidates', requireApiKey, candidatesRouter);

app.listen(port, () => {
  console.log(`JobPilot autofill API listening on http://localhost:${port}`);
  const dbMode = getDatabaseMode();
  console.log(`Database mode: ${dbMode}`);
  if (dbMode === 'none') {
    console.warn(
      'WARNING: No database configured. Copy .env.example to .env and set DATABASE_URL (or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY), then restart.'
    );
  }
  console.log(`Workday mock test page: http://localhost:${port}/workday-mock.html`);
});

async function shutdown(): Promise<void> {
  await closePool();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
