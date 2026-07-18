const DEFAULT_SETTINGS = {
  dataMode: 'api',
  candidateJson: '',
  apiBaseUrl: 'http://localhost:3001',
  apiKey: '',
  lookupMode: 'email',
  candidateEmail: 'gangisettykrishnavamsi@gmail.com',
  candidateId: '',
};

const API_CACHE_KEY = 'apiCandidateCache';

const SAMPLE_CANDIDATE_DATA = {
  legal: { terms_accepted: true, privacy_policy_accepted: true },
  profile: {
    email: 'jane.doe@example.com',
    phone: { type: 'mobile', number: '+1-555-010-9988' },
    skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
    social: { linkedin: 'https://linkedin.com/in/janedoe', website: 'https://janedoe.dev' },
    address: {
      line1: '123 MG Road',
      city: 'Bangalore',
      state: 'Karnataka',
      country: 'India',
      postal_code: '560001',
    },
    summary: 'Full-stack engineer with 5+ years building scalable web applications.',
    first_name: 'Jane',
    last_name: 'Doe',
  },
  education: [
    {
      school: 'State University',
      degree: 'Bachelor of Science',
      field_of_study: 'Computer Science',
      gpa: '3.8',
    },
  ],
  preferences: { years_of_experience: 5, desired_salary: 145000 },
  work_experience: [
    {
      title: 'Senior Software Engineer',
      company: 'Acme Corp',
      location: 'San Francisco, CA',
      description: 'Led frontend platform migration to React and TypeScript.',
    },
  ],
};

const els = {
  segmentBtns: document.querySelectorAll('.jp-segment-btn'),
  jsonPanel: document.getElementById('jsonPanel'),
  apiPanel: document.getElementById('apiPanel'),
  candidateJson: document.getElementById('candidateJson'),
  loadSample: document.getElementById('loadSample'),
  settingsToggle: document.getElementById('settingsToggle'),
  settingsPanel: document.getElementById('settingsPanel'),
  apiBaseUrl: document.getElementById('apiBaseUrl'),
  apiKey: document.getElementById('apiKey'),
  lookupBtns: document.querySelectorAll('.jp-lookup-btn'),
  emailLookupLabel: document.getElementById('emailLookupLabel'),
  idLookupLabel: document.getElementById('idLookupLabel'),
  candidateEmail: document.getElementById('candidateEmail'),
  candidateId: document.getElementById('candidateId'),
  fetchProfile: document.getElementById('fetchProfile'),
  fillPage: document.getElementById('fillPage'),
  validateJson: document.getElementById('validateJson'),
  status: document.getElementById('status'),
  profileIdle: document.getElementById('profileIdle'),
  profileFetching: document.getElementById('profileFetching'),
  profileLoaded: document.getElementById('profileLoaded'),
  profileAvatar: document.getElementById('profileAvatar'),
  profileName: document.getElementById('profileName'),
  profileDetail: document.getElementById('profileDetail'),
  profileFilledIcon: document.getElementById('profileFilledIcon'),
  steps: document.querySelectorAll('.jp-step'),
  stepLines: document.querySelectorAll('.jp-step-line'),
  closePopup: document.getElementById('closePopup'),
  resultPanel: document.getElementById('resultPanel'),
  resultTitle: document.getElementById('resultTitle'),
  clearResult: document.getElementById('clearResult'),
  statFilled: document.getElementById('statFilled'),
  statSkipped: document.getElementById('statSkipped'),
  statFailed: document.getElementById('statFailed'),
  resultFailures: document.getElementById('resultFailures'),
  scrollBody: document.querySelector('.jp-scroll-body'),
};

let uiStatus = 'idle';
let activeProfile = null;

const CHECK_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>';
const DASH_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="4 4"/></svg>';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hideResultPanel() {
  els.resultPanel.classList.add('hidden');
  els.resultPanel.classList.remove('is-error', 'is-success');
  els.resultFailures.classList.add('hidden');
  els.resultFailures.innerHTML = '';
}

function renderFillResult(summary) {
  const { filled, skipped, failed } = summary;
  els.statFilled.textContent = filled.length;
  els.statSkipped.textContent = skipped.length;
  els.statFailed.textContent = failed.length;

  const hasFailures = failed.length > 0;
  els.resultPanel.classList.remove('hidden');
  els.resultPanel.classList.toggle('is-error', hasFailures);
  els.resultPanel.classList.toggle('is-success', !hasFailures);
  els.resultTitle.textContent = hasFailures
    ? 'Autofill completed with errors'
    : 'Autofill successful';

  if (hasFailures) {
    els.resultFailures.classList.remove('hidden');
    els.resultFailures.innerHTML = failed
      .map(
        (item) => `
          <div class="jp-failure-item">
            <span class="jp-failure-field">${escapeHtml(item.jsonPath)}</span>
            <span class="jp-failure-message">${escapeHtml(item.message ?? 'Unknown error')}</span>
          </div>
        `,
      )
      .join('');
  } else {
    els.resultFailures.classList.add('hidden');
    els.resultFailures.innerHTML = '';
  }

  setStatus(
    hasFailures ? '' : `All ${filled.length} fields filled successfully.`,
    hasFailures ? '' : 'success',
  );

  requestAnimationFrame(() => {
    els.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (els.scrollBody) {
      els.scrollBody.scrollTop = els.scrollBody.scrollHeight;
    }
  });
}

function setStatus(message, type = '') {
  els.status.textContent = message;
  els.status.className = `jp-status ${type}`.trim();
  if (type === 'error') {
    hideResultPanel();
  }
}

function getSelectedMode() {
  const active = document.querySelector('.jp-segment-btn.is-active');
  return active?.dataset.source === 'json' ? 'json' : 'api';
}

function getLookupMode() {
  const active = document.querySelector('.jp-lookup-btn.is-active');
  return active?.dataset.lookup === 'id' ? 'id' : 'email';
}

function profileFromData(data) {
  const first = data?.profile?.first_name ?? '';
  const last = data?.profile?.last_name ?? '';
  const name = [first, last].filter(Boolean).join(' ') || 'Candidate';
  const email = data?.profile?.email ?? '';
  const title = data?.work_experience?.[0]?.title ?? data?.profile?.summary?.slice(0, 48) ?? 'Profile loaded';
  const location = [data?.profile?.address?.city, data?.profile?.address?.state].filter(Boolean).join(', ');
  return { name, email, title, location, initials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() };
}

function getStepIndex() {
  if (uiStatus === 'idle') return 0;
  if (uiStatus === 'fetching') return 2;
  if (uiStatus === 'loaded') return 2;
  if (uiStatus === 'filling' || uiStatus === 'filled') return 3;
  return 1;
}

function renderStepper() {
  const stepIndex = getStepIndex();
  els.steps.forEach((step, index) => {
    step.classList.toggle('is-done', index < stepIndex);
    step.classList.toggle('is-active', index === stepIndex);
    const icon = step.querySelector('.jp-step-icon');
    if (icon) {
      icon.innerHTML = index < stepIndex ? CHECK_ICON : DASH_ICON;
    }
  });
  els.stepLines.forEach((line, index) => {
    line.classList.toggle('is-done', index < stepIndex);
  });
}

function renderProfileCard() {
  els.profileIdle.classList.toggle('hidden', uiStatus !== 'idle');
  els.profileFetching.classList.toggle('hidden', uiStatus !== 'fetching');
  els.profileLoaded.classList.toggle('hidden', !activeProfile || uiStatus === 'idle' || uiStatus === 'fetching');

  if (activeProfile) {
    els.profileAvatar.textContent = activeProfile.initials;
    els.profileName.textContent = activeProfile.name;
    const detailParts = [activeProfile.title, activeProfile.email].filter(Boolean);
    els.profileDetail.textContent = detailParts.join(' · ');
    els.profileFilledIcon.classList.toggle('hidden', uiStatus !== 'filled');
  }

  const canFill = Boolean(activeProfile) && uiStatus !== 'filling';
  els.fillPage.disabled = !canFill;

  const fillLabel = els.fillPage.querySelector('.jp-btn-label');
  if (fillLabel) {
    if (uiStatus === 'filled') {
      fillLabel.innerHTML = `${CHECK_ICON} Filled`;
    } else if (uiStatus === 'filling') {
      fillLabel.textContent = 'Filling…';
    } else {
      fillLabel.innerHTML =
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 4 3 3-9 9H6v-3l9-9Z"/><path d="M9 15l-3 3"/><path d="m18 7 3 3"/></svg> Fill this page';
    }
  }

  els.fillPage.classList.toggle('is-filling', uiStatus === 'filling');
  renderStepper();
}

function setUiStatus(next, profile = activeProfile) {
  uiStatus = next;
  activeProfile = profile;
  renderProfileCard();
}

function updateLookupPanels() {
  const byEmail = getLookupMode() === 'email';
  els.emailLookupLabel.classList.toggle('hidden', !byEmail);
  els.idLookupLabel.classList.toggle('hidden', byEmail);
}

function updateModePanels() {
  const mode = getSelectedMode();
  els.jsonPanel.classList.toggle('hidden', mode !== 'json');
  els.apiPanel.classList.toggle('hidden', mode !== 'api');
  els.fetchProfile.classList.toggle('hidden', mode !== 'api');
  if (mode === 'api') {
    updateLookupPanels();
  }
}

function buildLookupKey(settings) {
  const base = (settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl).replace(/\/$/, '');
  const lookupMode = settings.lookupMode || 'email';
  if (lookupMode === 'email') {
    const email = (settings.candidateEmail || '').trim().toLowerCase();
    return `email:${email}@${base}`;
  }
  const id = (settings.candidateId || '').trim();
  return `id:${id}@${base}`;
}

async function getApiSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

async function readCandidateCache() {
  const stored = await chrome.storage.local.get(API_CACHE_KEY);
  return stored[API_CACHE_KEY] ?? null;
}

function isCacheValid(settings, cache) {
  if (!cache?.data || !cache?.lookupKey) return false;
  return cache.lookupKey === buildLookupKey(settings);
}

async function writeCandidateCache(settings, data) {
  await chrome.storage.local.set({
    [API_CACHE_KEY]: {
      data,
      lookupKey: buildLookupKey(settings),
      fetchedAt: new Date().toISOString(),
    },
  });
}

async function hydrateProfileFromCache() {
  if (getSelectedMode() === 'json') {
    return;
  }
  const settings = await getApiSettings();
  const cache = await readCandidateCache();
  if (isCacheValid(settings, cache)) {
    setUiStatus('loaded', profileFromData(cache.data));
  }
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  els.segmentBtns.forEach((btn) => {
    const active = btn.dataset.source === (stored.dataMode || 'api');
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  els.candidateJson.value = stored.candidateJson || JSON.stringify(SAMPLE_CANDIDATE_DATA, null, 2);
  els.apiBaseUrl.value = stored.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl;
  els.apiKey.value = stored.apiKey || '';
  els.lookupBtns.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.lookup === (stored.lookupMode || 'email'));
  });
  els.candidateEmail.value = stored.candidateEmail || DEFAULT_SETTINGS.candidateEmail;
  els.candidateId.value = stored.candidateId || '';
  updateModePanels();
  await hydrateProfileFromCache();
  renderProfileCard();
}

async function persistSettings() {
  await chrome.storage.sync.set({
    dataMode: getSelectedMode(),
    candidateJson: els.candidateJson.value,
    apiBaseUrl: els.apiBaseUrl.value.trim() || DEFAULT_SETTINGS.apiBaseUrl,
    apiKey: els.apiKey.value.trim(),
    lookupMode: getLookupMode(),
    candidateEmail: els.candidateEmail.value.trim(),
    candidateId: els.candidateId.value.trim(),
  });
}

function parseCandidateJson() {
  const raw = els.candidateJson.value.trim();
  if (!raw) {
    throw new Error('Paste candidate JSON or click "Load sample data".');
  }
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object') {
    return parsed.data;
  }
  return parsed;
}

async function fetchCandidateFromApi(settings) {
  const headers = {};
  if (settings.apiKey) headers['x-api-key'] = settings.apiKey;

  const base = (settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl).replace(/\/$/, '');
  let url;
  if ((settings.lookupMode || 'email') === 'email') {
    const email = settings.candidateEmail?.trim();
    if (!email) throw new Error('Set your email for API lookup.');
    url = `${base}/candidates?email=${encodeURIComponent(email)}`;
  } else {
    if (!settings.candidateId) throw new Error('Set a Candidate ID for API mode.');
    url = `${base}/candidates/${settings.candidateId}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || `API error ${response.status}`);
  }

  const candidate = await response.json();
  return candidate.data;
}

async function resolveCandidateData({ allowFetch = false } = {}) {
  const mode = getSelectedMode();
  if (mode === 'json') {
    const data = parseCandidateJson();
    return data;
  }

  const settings = await getApiSettings();
  const cache = await readCandidateCache();
  if (isCacheValid(settings, cache)) {
    return cache.data;
  }

  if (!allowFetch) {
    throw new Error('No cached profile. Click "Fetch profile" first.');
  }

  const data = await fetchCandidateFromApi(settings);
  await writeCandidateCache(settings, data);
  return data;
}

async function ensureContentScript(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (ping?.ok) return;
  } catch {
    // Not injected yet.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/content.js'],
  });

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content/content.css'],
    });
  } catch {
    // CSS optional
  }
}

async function fillActiveTab(candidateData) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab found.');
  }

  await ensureContentScript(tab.id);

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: 'AUTOFILL',
    candidateData,
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'Autofill failed — open DevTools console (F12) for [JobPilot] logs.');
  }

  return response.summary;
}

els.segmentBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    els.segmentBtns.forEach((other) => {
      other.classList.toggle('is-active', other === btn);
      other.setAttribute('aria-selected', other === btn ? 'true' : 'false');
    });
    updateModePanels();
    void persistSettings();
    if (getSelectedMode() === 'json') {
      setUiStatus('idle', null);
    } else {
      void hydrateProfileFromCache();
    }
  });
});

els.lookupBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    els.lookupBtns.forEach((other) => other.classList.toggle('is-active', other === btn));
    updateLookupPanels();
    void persistSettings();
    setUiStatus('idle', null);
  });
});

for (const input of [els.candidateEmail, els.candidateId, els.apiBaseUrl, els.apiKey]) {
  input.addEventListener('change', () => {
    void persistSettings();
    if (getSelectedMode() === 'api') {
      setUiStatus('idle', null);
    }
  });
}

els.settingsToggle.addEventListener('click', () => {
  const open = els.settingsPanel.classList.toggle('hidden');
  els.settingsToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
});

els.loadSample.addEventListener('click', () => {
  els.candidateJson.value = JSON.stringify(SAMPLE_CANDIDATE_DATA, null, 2);
  setStatus('Sample data loaded.', 'success');
});

els.fetchProfile.addEventListener('click', async () => {
  try {
    setStatus('');
    setUiStatus('fetching', null);
    await persistSettings();
    const settings = await getApiSettings();
    const data = await fetchCandidateFromApi(settings);
    await writeCandidateCache(settings, data);
    const profile = profileFromData(data);
    setUiStatus('loaded', profile);
    setStatus(`Profile loaded — ${profile.name}.`, 'success');
  } catch (error) {
    setUiStatus('idle', null);
    setStatus(error.message, 'error');
  }
});

els.validateJson.addEventListener('click', () => {
  try {
    const data = parseCandidateJson();
    const profile = profileFromData(data);
    setUiStatus('loaded', profile);
    setStatus(`Valid JSON — ${profile.name}.`, 'success');
    void persistSettings();
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

els.fillPage.addEventListener('click', async () => {
  try {
    setStatus('');
    setUiStatus('filling', activeProfile);
    await persistSettings();
    const candidateData = await resolveCandidateData({ allowFetch: false });
    if (!activeProfile) {
      setUiStatus('loaded', profileFromData(candidateData));
    }
    const summary = await fillActiveTab(candidateData);
    const { filled, skipped, failed } = summary;
    setUiStatus('filled', activeProfile ?? profileFromData(candidateData));
    renderFillResult(summary);
  } catch (error) {
    setUiStatus(activeProfile ? 'loaded' : 'idle', activeProfile);
    setStatus(error.message, 'error');
  }
});

els.closePopup?.addEventListener('click', () => {
  window.close();
});

els.clearResult?.addEventListener('click', () => {
  hideResultPanel();
  setStatus('');
});

void loadSettings();
