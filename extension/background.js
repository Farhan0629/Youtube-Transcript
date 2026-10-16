// TranscriptGen Background Service Worker (Manifest V3)
// Relays API requests so in-page content scripts aren't blocked by YouTube's CSP or Private Network Access rules.

const DEFAULT_LOCAL = 'http://localhost:3000';
const STORAGE_KEYS = ['apiBase', 'geminiKey', 'geminiModel'];

function normalizeBase(raw) {
  const s = String(raw || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

async function getSettings() {
  try {
    const got = await chrome.storage.sync.get(STORAGE_KEYS);
    return {
      apiBase: got.apiBase || '',
      geminiKey: got.geminiKey || '',
      geminiModel: got.geminiModel || '',
    };
  } catch (_) {
    try {
      const got2 = await chrome.storage.local.get(STORAGE_KEYS);
      return {
        apiBase: got2.apiBase || '',
        geminiKey: got2.geminiKey || '',
        geminiModel: got2.geminiModel || '',
      };
    } catch (_) {
      return { apiBase: '', geminiKey: '', geminiModel: '' };
    }
  }
}

function isYouTubeWatch(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be' && /^\/[a-zA-Z0-9_-]{11}/.test(u.pathname)) return true;
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch' || u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/')) return true;
      if (u.searchParams.get('v')) return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

// Background API fetch router
async function handleApiFetch(path, body) {
  const settings = await getSettings();
  const bases = [];
  const primary = normalizeBase(settings.apiBase);
  if (primary) bases.push(primary);
  if (DEFAULT_LOCAL !== primary) bases.push(DEFAULT_LOCAL);

  const headers = { 'Content-Type': 'application/json' };
  const k = String(settings.geminiKey || '').trim();
  if (/^AIza[0-9A-Za-z_-]{30,}$/.test(k)) headers['x-gemini-key'] = k;
  const m = String(settings.geminiModel || '').trim();
  if (m) headers['x-gemini-model'] = m;

  let lastErr = null;
  for (const base of bases) {
    const url = `${base.replace(/\/+$/, '')}${path}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }
      return { ok: true, data, base };
    } catch (err) {
      lastErr = err;
      // If network refused on primary, try fallback (localhost)
      continue;
    }
  }
  const msg = lastErr?.message || 'Could not connect to TranscriptGen backend.';
  if (/Failed to fetch|NetworkError|ECONNREFUSED/i.test(msg)) {
    return {
      ok: false,
      error: 'Cannot connect to TranscriptGen. Run `npm start` in your project terminal (http://localhost:3000), or set your deployed URL in Settings.',
    };
  }
  return { ok: false, error: msg };
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === 'API_FETCH') {
    handleApiFetch(request.path, request.body)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // Keep channel open for async response
  }
});

// Notify content script on SPA tab URL change
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && isYouTubeWatch(changeInfo.url)) {
    chrome.tabs.sendMessage(tabId, { action: 'YT_URL_CHANGED', url: changeInfo.url }).catch(() => {});
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[TranscriptGen] Extension installed. Default backend: http://localhost:3000');
});
