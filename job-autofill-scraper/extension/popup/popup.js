const DEFAULT_SETTINGS = {
  dataMode: 'json',
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
    {
      title: 'Software Engineer',
      company: 'StartupXYZ',
      location: 'Remote',
      description: 'Built REST APIs and internal tooling with Node.js.',
    },
  ],
};

const els = {
  dataModeRadios: document.querySelectorAll('input[name="dataMode"]'),
  jsonPanel: document.getElementById('jsonPanel'),
  apiPanel: document.getElementById('apiPanel'),
  candidateJson: document.getElementById('candidateJson'),
  loadSample: document.getElementById('loadSample'),
  apiBaseUrl: document.getElementById('apiBaseUrl'),
  apiKey: document.getElementById('apiKey'),
  lookupModeRadios: document.querySelectorAll('input[name="lookupMode"]'),
  emailLookupLabel: document.getElementById('emailLookupLabel'),
  idLookupLabel: document.getElementById('idLookupLabel'),
  candidateEmail: document.getElementById('candidateEmail'),
  candidateId: document.getElementById('candidateId'),
  saveSettings: document.getElementById('saveSettings'),
  fetchProfile: document.getElementById('fetchProfile'),
  cacheStatus: document.getElementById('cacheStatus'),
  fillPage: document.getElementById('fillPage'),
  validateJson: document.getElementById('validateJson'),
  status: document.getElementById('status'),
};

function setStatus(message, type = '') {
  els.status.textContent = message;
  els.status.className = `status ${type}`.trim();
}

function getSelectedMode() {
  const checked = document.querySelector('input[name="dataMode"]:checked');
  return checked?.value === 'api' ? 'api' : 'json';
}

function getLookupMode() {
  const checked = document.querySelector('input[name="lookupMode"]:checked');
  return checked?.value === 'id' ? 'id' : 'email';
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
  if (mode === 'api') {
    updateLookupPanels();
    updateCacheStatus();
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

async function updateCacheStatus() {
  if (!els.cacheStatus) return;
  const settings = await getApiSettings();
  const cache = await readCandidateCache();
  if (!isCacheValid(settings, cache)) {
    els.cacheStatus.textContent = 'No profile loaded — click "Fetch profile" first.';
    els.cacheStatus.className = 'cache-status';
    return;
  }
  const name = [cache.data?.profile?.first_name, cache.data?.profile?.last_name]
    .filter(Boolean)
    .join(' ');
  const when = cache.fetchedAt
    ? new Date(cache.fetchedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
    : 'unknown time';
  els.cacheStatus.textContent = name
    ? `Using cached profile: ${name} (fetched ${when}).`
    : `Profile cached (fetched ${when}).`;
  els.cacheStatus.className = 'cache-status ready';
}

async function writeCandidateCache(settings, data) {
  await chrome.storage.local.set({
    [API_CACHE_KEY]: {
      data,
      lookupKey: buildLookupKey(settings),
      fetchedAt: new Date().toISOString(),
    },
  });
  await updateCacheStatus();
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  for (const radio of els.dataModeRadios) {
    radio.checked = radio.value === stored.dataMode;
  }
  els.candidateJson.value = stored.candidateJson || JSON.stringify(SAMPLE_CANDIDATE_DATA, null, 2);
  els.apiBaseUrl.value = stored.apiBaseUrl;
  els.apiKey.value = stored.apiKey;
  for (const radio of els.lookupModeRadios) {
    radio.checked = radio.value === (stored.lookupMode || 'email');
  }
  els.candidateEmail.value = stored.candidateEmail || DEFAULT_SETTINGS.candidateEmail;
  els.candidateId.value = stored.candidateId;
  updateModePanels();
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
    return parseCandidateJson();
  }

  const settings = await getApiSettings();
  const cache = await readCandidateCache();
  if (isCacheValid(settings, cache)) {
    return cache.data;
  }

  if (!allowFetch) {
    throw new Error('No cached profile. Click "Fetch profile" first (or after changing email/ID).');
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
    // Not injected yet — inject on demand (works on any site after you click Fill).
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

for (const radio of els.dataModeRadios) {
  radio.addEventListener('change', () => {
    updateModePanels();
    persistSettings();
  });
}

for (const radio of els.lookupModeRadios) {
  radio.addEventListener('change', () => {
    updateLookupPanels();
    persistSettings();
    updateCacheStatus();
  });
}

for (const input of [els.candidateEmail, els.candidateId, els.apiBaseUrl]) {
  input.addEventListener('change', () => {
    persistSettings();
    updateCacheStatus();
  });
}

els.loadSample.addEventListener('click', () => {
  els.candidateJson.value = JSON.stringify(SAMPLE_CANDIDATE_DATA, null, 2);
  setStatus('Sample data loaded.', 'success');
});

els.saveSettings.addEventListener('click', () => {
  persistSettings()
    .then(() => {
      updateCacheStatus();
      setStatus('API settings saved.', 'success');
    })
    .catch((err) => setStatus(err.message, 'error'));
});

els.fetchProfile.addEventListener('click', async () => {
  try {
    setStatus('Fetching profile from API…');
    await persistSettings();
    const settings = await getApiSettings();
    const data = await fetchCandidateFromApi(settings);
    await writeCandidateCache(settings, data);
    const name = [data?.profile?.first_name, data?.profile?.last_name].filter(Boolean).join(' ');
    setStatus(name ? `Profile loaded — ${name}.` : 'Profile loaded and cached.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

els.validateJson.addEventListener('click', () => {
  try {
    const data = parseCandidateJson();
    const name = [data?.profile?.first_name, data?.profile?.last_name].filter(Boolean).join(' ');
    setStatus(`Valid JSON${name ? ` — ${name}` : ''}.`, 'success');
    persistSettings();
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

els.fillPage.addEventListener('click', async () => {
  try {
    setStatus('Running autofill…');
    await persistSettings();
    const candidateData = await resolveCandidateData({ allowFetch: false });
    const summary = await fillActiveTab(candidateData);
    const { filled, skipped, failed } = summary;
    const lines = [
      `Done — filled ${filled.length}, skipped ${skipped.length}, failed ${failed.length}.`,
    ];
    if (failed.length > 0) {
      lines.push('', 'Failed:');
      for (const item of failed.slice(0, 5)) {
        lines.push(`• ${item.jsonPath}: ${item.message ?? 'unknown error'}`);
      }
    }
    setStatus(lines.join('\n'), failed.length ? 'error' : 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

loadSettings();
