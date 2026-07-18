import { analyzeMatch } from '../../../packages/match-core/src/index.ts';
import { buildUserMatchText, parseJobKey } from '../../../packages/shared-types/src/index.ts';
import { runFillEngine } from '../../scraper/src/fill-engine/index.ts';
import type { CandidateData } from '../../shared/src/profile.ts';

const DEFAULT_API = 'http://127.0.0.1:3001';
const DEFAULT_SCRAPER = 'http://127.0.0.1:8000';
const API_CACHE_KEY = 'apiCandidateCache';
const LOCAL_CANDIDATE_ID_KEY = 'jobpilotCandidateId';

let overlayInFlight = false;
let lastOverlayAt = 0;
let domRetryCount = 0;
const MAX_DOM_RETRIES = 3;

interface MatchContext {
  candidateId?: string;
  jobKey?: string;
  jobDescription?: string;
  jobTitle?: string;
}

interface MatchAnalysis {
  score: number;
  matched: string[];
  missing: string[];
  matchedCount: number;
  totalKeywords: number;
}

interface ExtensionSettings {
  apiBaseUrl: string;
  scraperBaseUrl: string;
  apiKey: string;
  candidateId: string;
}

async function getSettings(): Promise<ExtensionSettings> {
  const [syncStored, localStored] = await Promise.all([
    chrome.storage.sync.get(['apiBaseUrl', 'scraperBaseUrl', 'apiKey', 'candidateId']),
    chrome.storage.local.get([LOCAL_CANDIDATE_ID_KEY]),
  ]);

  return {
    apiBaseUrl: syncStored.apiBaseUrl || DEFAULT_API,
    scraperBaseUrl: syncStored.scraperBaseUrl || DEFAULT_SCRAPER,
    apiKey: syncStored.apiKey || '',
    candidateId:
      localStored[LOCAL_CANDIDATE_ID_KEY]
      || syncStored.candidateId
      || '',
  };
}

function readContextFromUrl(): MatchContext | null {
  const params = new URLSearchParams(window.location.search);
  const candidateId = params.get('jp_candidate');
  if (!candidateId) {
    return null;
  }

  return {
    candidateId,
    jobKey: params.get('jp_job') ?? undefined,
  };
}

async function persistCandidateId(candidateId: string): Promise<void> {
  const stored = await chrome.storage.local.get(LOCAL_CANDIDATE_ID_KEY);
  if (stored[LOCAL_CANDIDATE_ID_KEY] === candidateId) {
    return;
  }
  await chrome.storage.local.set({ [LOCAL_CANDIDATE_ID_KEY]: candidateId });
}

async function persistProfileCache(candidateId: string, data: CandidateData): Promise<void> {
  const lookupKey = `frontend:${candidateId}`;
  const stored = await chrome.storage.local.get(API_CACHE_KEY);
  const cache = stored[API_CACHE_KEY];
  if (cache?.lookupKey === lookupKey && cache?.data) {
    return;
  }

  await chrome.storage.local.set({
    [API_CACHE_KEY]: {
      data,
      lookupKey,
      fetchedAt: new Date().toISOString(),
    },
  });
}

async function readCachedCandidate(): Promise<CandidateData | null> {
  const stored = await chrome.storage.local.get(API_CACHE_KEY);
  const cache = stored[API_CACHE_KEY];
  if (cache?.data && typeof cache.data === 'object') {
    return cache.data as CandidateData;
  }
  return null;
}

async function resolveCandidate(settings: ExtensionSettings, context: MatchContext): Promise<CandidateData> {
  const cached = await readCachedCandidate();
  if (cached) {
    return cached;
  }

  const candidateId = context.candidateId || settings.candidateId;
  if (!candidateId) {
    throw new Error('Save your profile on JobPilot or fetch it from the extension popup first.');
  }

  return fetchCandidate(settings.apiBaseUrl, settings.apiKey, candidateId);
}

async function fetchCandidate(apiBaseUrl: string, apiKey: string, candidateId: string): Promise<CandidateData> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const res = await fetch(`${apiBaseUrl}/candidates/${candidateId}`, { headers });
  if (!res.ok) {
    throw new Error('Could not load candidate profile for match scoring.');
  }

  const payload = await res.json();
  return payload.data as CandidateData;
}

async function fetchJobByKey(
  scraperBaseUrl: string,
  jobKey: string,
): Promise<{ description: string; title: string } | null> {
  const parsed = parseJobKey(jobKey);
  if (!parsed) {
    return null;
  }

  const query = new URLSearchParams({
    company_id: parsed.companyId,
    source: parsed.source,
    job_id: parsed.jobId,
  });

  const res = await fetch(`${scraperBaseUrl}/api/jobs/by-key?${query.toString()}`);
  if (!res.ok) {
    return null;
  }

  const job = await res.json();
  return {
    description: job.description || job.title || '',
    title: job.title || 'Job',
  };
}

async function fetchJobByUrl(
  scraperBaseUrl: string,
  pageUrl: string,
): Promise<{ description: string; title: string } | null> {
  const cleanUrl = new URL(pageUrl);
  cleanUrl.searchParams.delete('jp_candidate');
  cleanUrl.searchParams.delete('jp_job');

  const query = new URLSearchParams({ url: cleanUrl.toString() });
  const res = await fetch(`${scraperBaseUrl}/api/jobs/by-url?${query.toString()}`);
  if (!res.ok) {
    return null;
  }

  const job = await res.json();
  return {
    description: job.description || job.title || '',
    title: job.title || 'Job',
  };
}

async function resolveJobDescription(
  scraperBaseUrl: string,
  context: MatchContext,
): Promise<string> {
  if (context.jobDescription?.trim()) {
    return context.jobDescription;
  }

  if (context.jobKey) {
    const byKey = await fetchJobByKey(scraperBaseUrl, context.jobKey);
    if (byKey?.description) {
      return byKey.description;
    }
  }

  const byUrl = await fetchJobByUrl(scraperBaseUrl, window.location.href);
  if (byUrl?.description) {
    return byUrl.description;
  }

  return extractDomJobDescription();
}

function extractDomJobDescription(): string {
  const selectors = [
    '[data-automation-id="jobPostingDescription"]',
    '[data-automation-id="jobPostingHeader"]',
    '[data-qa="job-description"]',
    '.job-description',
    'main',
  ];

  for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (node?.textContent?.trim()) {
      return node.textContent.trim();
    }
  }

  return document.body.innerText.slice(0, 12000);
}

function isWorkdayJobPage(): boolean {
  return /myworkdayjobs\.com/i.test(window.location.hostname)
    && (/\/job\//i.test(window.location.pathname) || /\/jobs\//i.test(window.location.pathname));
}

function findBannerAnchor(): HTMLElement | null {
  const applyButton = document.querySelector<HTMLElement>(
    [
      '[data-automation-id="jobPostingApplyButton"]',
      'button[data-automation-id="applyButton"]',
      'a[data-automation-id="applyButton"]',
      'a[data-automation-id="adventureButton"]',
    ].join(', '),
  );

  if (applyButton?.parentElement) {
    return applyButton.parentElement;
  }

  const description = document.querySelector<HTMLElement>(
    '[data-automation-id="jobPostingDescription"], [data-automation-id="jobPostingPage"]',
  );
  if (description) {
    return description;
  }

  const header = document.querySelector<HTMLElement>('[data-automation-id="jobPostingHeader"]');
  return header?.parentElement ?? header;
}

async function waitForBannerAnchor(maxMs = 8000): Promise<HTMLElement | null> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const anchor = findBannerAnchor();
    if (anchor) {
      return anchor;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 300));
  }
  return null;
}

function removeBanner(): void {
  document.getElementById('jobpilot-match-banner')?.remove();
}

function removeFloatingPanel(): void {
  document.getElementById('jobpilot-floating-panel')?.remove();
}

function buildGaugeSvg(score: number): string {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const dash = circumference * progress;

  return `
    <svg viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="${radius}" fill="none" stroke="#dbeafe" stroke-width="6"></circle>
      <circle
        cx="28"
        cy="28"
        r="${radius}"
        fill="none"
        stroke="#14b8a6"
        stroke-width="6"
        stroke-linecap="round"
        stroke-dasharray="${dash} ${circumference - dash}"
      ></circle>
    </svg>
  `;
}

function renderInlineBanner(options: {
  score: number;
  matchedCount: number;
  totalKeywords: number;
  onAutofill?: () => void;
  setupMessage?: string;
}): boolean {
  removeBanner();

  const anchor = findBannerAnchor();
  if (!anchor) {
    return false;
  }

  const host = document.createElement('div');
  host.id = 'jobpilot-match-banner';
  host.style.cssText = 'margin: 16px 0 12px; width: 100%;';

  if (options.setupMessage) {
    host.innerHTML = `
      <div class="jp-banner-inner">
        <div class="jp-copy">
          <p class="jp-title">Resume Match</p>
          <p class="jp-subtitle">${options.setupMessage}</p>
          <p class="jp-meta">Open http://localhost:5173/profile to save your resume, then refresh this page.</p>
        </div>
        <div class="jp-actions">
          <span class="jp-brand">JobPilot</span>
          <button type="button" class="jp-dismiss" id="jobpilot-inline-dismiss" aria-label="Dismiss">×</button>
        </div>
      </div>
    `;
  } else {
    host.innerHTML = `
      <div class="jp-banner-inner">
        <div class="jp-gauge">
          ${buildGaugeSvg(options.score)}
          <div class="jp-gauge-label">${Math.round(options.score)}%</div>
        </div>
        <div class="jp-copy">
          <p class="jp-title">Resume Match</p>
          <p class="jp-subtitle">
            ${options.matchedCount} of ${options.totalKeywords} keywords are present in your resume
          </p>
          <p class="jp-meta">Uses JobPilot skill matching from your saved profile</p>
        </div>
        <div class="jp-actions">
          <span class="jp-brand">JobPilot</span>
          ${options.onAutofill ? '<button type="button" class="jp-autofill" id="jobpilot-inline-autofill">Autofill</button>' : ''}
          <button type="button" class="jp-dismiss" id="jobpilot-inline-dismiss" aria-label="Dismiss">×</button>
        </div>
      </div>
    `;
  }

  anchor.insertAdjacentElement('afterend', host);

  host.querySelector('#jobpilot-inline-dismiss')?.addEventListener('click', removeBanner);
  if (options.onAutofill) {
    host.querySelector('#jobpilot-inline-autofill')?.addEventListener('click', options.onAutofill);
  }

  return true;
}

function renderFloatingPanel(options: {
  score: number;
  matchedCount: number;
  totalKeywords: number;
  matched: string[];
  missing: string[];
  onAutofill: () => void;
}): void {
  removeFloatingPanel();

  const host = document.createElement('div');
  host.id = 'jobpilot-floating-panel';

  const panel = document.createElement('div');
  panel.style.cssText =
    'width:320px;background:#111827;color:#f8fafc;border:1px solid #334155;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.45);padding:16px;';

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <strong style="font-size:14px;">JobPilot Match</strong>
      <button id="jobpilot-dismiss" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:18px;">×</button>
    </div>
    <div style="font-size:32px;font-weight:700;color:#60a5fa;margin-bottom:8px;">${options.score.toFixed(1)}%</div>
    <div style="font-size:12px;color:#cbd5e1;margin-bottom:8px;">
      ${options.matchedCount} of ${options.totalKeywords} keywords matched
    </div>
    <div style="font-size:12px;color:#cbd5e1;margin-bottom:8px;"><strong>Matched:</strong> ${options.matched.slice(0, 6).join(', ') || 'None'}</div>
    <div style="font-size:12px;color:#fca5a5;margin-bottom:12px;"><strong>Missing:</strong> ${options.missing.slice(0, 6).join(', ') || 'None'}</div>
    <button id="jobpilot-autofill" style="width:100%;padding:10px 12px;border:none;border-radius:10px;background:#2563eb;color:white;font-weight:600;cursor:pointer;">Autofill application</button>
  `;

  host.appendChild(panel);
  document.documentElement.appendChild(host);

  panel.querySelector('#jobpilot-dismiss')?.addEventListener('click', removeFloatingPanel);
  panel.querySelector('#jobpilot-autofill')?.addEventListener('click', options.onAutofill);
}

function computeAnalysis(profileText: string, jobDescription: string): MatchAnalysis {
  const analysis = analyzeMatch({
    professionalSummary: profileText,
    jobDescription,
    useWeightedScoring: true,
  });

  const score = analysis.weightedResult?.weightedScore ?? analysis.result.score;
  const matched = analysis.result.matchedSkills;
  const missing = analysis.result.missingSkills;
  const totalKeywords = analysis.jdSkillCount || matched.length + missing.length;

  return {
    score,
    matched,
    missing,
    matchedCount: matched.length,
    totalKeywords,
  };
}

async function showMatchOverlay(context: MatchContext): Promise<void> {
  const now = Date.now();
  if (overlayInFlight || now - lastOverlayAt < 1200) {
    return;
  }

  overlayInFlight = true;
  try {
    const settings = await getSettings();
    if (context.candidateId) {
      await persistCandidateId(context.candidateId);
    }

    if (isWorkdayJobPage()) {
      await waitForBannerAnchor();
    }

    const candidate = await resolveCandidate(settings, context);
    const profileText = buildUserMatchText(candidate);
    const jobDescription = await resolveJobDescription(settings.scraperBaseUrl, context);

    const analysis = computeAnalysis(profileText, jobDescription);
    const onAutofill = () => {
      void runAutofill(candidate);
    };

    if (isWorkdayJobPage()) {
      const rendered = renderInlineBanner({
        score: analysis.score,
        matchedCount: analysis.matchedCount,
        totalKeywords: analysis.totalKeywords,
        onAutofill,
      });
      if (!rendered) {
        renderFloatingPanel({
          score: analysis.score,
          matchedCount: analysis.matchedCount,
          totalKeywords: analysis.totalKeywords,
          matched: analysis.matched,
          missing: analysis.missing,
          onAutofill,
        });
      }
      domRetryCount = MAX_DOM_RETRIES;
      return;
    }

    renderFloatingPanel({
      score: analysis.score,
      matchedCount: analysis.matchedCount,
      totalKeywords: analysis.totalKeywords,
      matched: analysis.matched,
      missing: analysis.missing,
      onAutofill,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Match scoring unavailable.';
    console.error('[JobPilot] Match overlay failed:', error);

    const needsProfile = /profile|candidate|fetch profile/i.test(message);
    const isQuotaError = /MAX_WRITE_OPERATIONS|quota/i.test(message);

    if (isWorkdayJobPage()) {
      await waitForBannerAnchor();
      const rendered = renderInlineBanner({
        setupMessage: isQuotaError
          ? 'JobPilot is syncing your profile. Refresh this page in a few seconds.'
          : needsProfile
            ? message
            : 'Could not score this job yet. Save your profile on JobPilot and refresh.',
        score: 0,
        matchedCount: 0,
        totalKeywords: 0,
      });
      if (!rendered) {
        renderFloatingPanel({
          score: 0,
          matchedCount: 0,
          totalKeywords: 0,
          matched: [],
          missing: [message],
          onAutofill: () => undefined,
        });
      }
    }
  } finally {
    overlayInFlight = false;
    lastOverlayAt = Date.now();
  }
}

async function runAutofill(candidateData: CandidateData): Promise<void> {
  try {
    const summary = await runFillEngine(document, candidateData, {
      onLog: (msg, detail) => console.log('[JobPilot]', msg, detail ?? ''),
    });

    removeBanner();
    removeFloatingPanel();
    alert(`JobPilot filled ${summary.filled.length} fields. Skipped ${summary.skipped.length}.`);
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Autofill failed');
  }
}

function syncProfileFromFrontend(): void {
  if (window.location.hostname !== 'localhost' || window.location.port !== '5173') {
    return;
  }

  const candidateId = localStorage.getItem('jobpilot_candidate_id');
  const rawData = localStorage.getItem('jobpilot_candidate_data');

  if (!candidateId) {
    return;
  }

  void persistCandidateId(candidateId);

  if (rawData) {
    try {
      const data = JSON.parse(rawData) as CandidateData;
      void persistProfileCache(candidateId, data);
    } catch {
      // Ignore invalid cached profile JSON.
    }
  }
}

let refreshTimer: number | undefined;
function scheduleMatchRefresh(context: MatchContext): void {
  if (domRetryCount >= MAX_DOM_RETRIES) {
    return;
  }
  domRetryCount += 1;

  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    void showMatchOverlay(context);
  }, 1200);
}

function bootMatchWidget(): void {
  syncProfileFromFrontend();

  const urlContext = readContextFromUrl();
  const context: MatchContext = urlContext ?? {};

  if (isWorkdayJobPage() || urlContext) {
    void showMatchOverlay(context);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[API_CACHE_KEY]) {
      return;
    }
    domRetryCount = 0;
    scheduleMatchRefresh(context);
  });

  if (window.location.hostname === 'localhost' && window.location.port === '5173') {
    window.addEventListener('storage', () => {
      syncProfileFromFrontend();
    });
  }

  if (isWorkdayJobPage()) {
    const observer = new MutationObserver(() => {
      if (document.getElementById('jobpilot-match-banner') || document.getElementById('jobpilot-floating-panel')) {
        return;
      }
      scheduleMatchRefresh(context);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }

  if (message?.type === 'SHOW_MATCH') {
    void showMatchOverlay(message.context as MatchContext);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type !== 'AUTOFILL') {
    return false;
  }

  (async () => {
    try {
      const summary = await runFillEngine(document, message.candidateData, {
        onLog: (msg, detail) => console.log('[JobPilot]', msg, detail ?? ''),
      });
      sendResponse({ ok: true, summary });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return true;
});

bootMatchWidget();
console.log('[JobPilot] Integrated content script ready on', window.location.hostname);
