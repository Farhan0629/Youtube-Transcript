(() => {
  const $ = (s) => document.getElementById(s);
  const apiBaseEl = $('apiBase');
  const geminiKeyEl = $('geminiKey');
  const geminiModelEl = $('geminiModel');
  const saveBtn = $('saveBtn');
  const testBtn = $('testBtn');
  const resetBtn = $('resetBtn');
  const statusEl = $('status');

  const DEFAULT_LOCAL = 'http://localhost:3000';
  const KEYS = ['apiBase', 'geminiKey', 'geminiModel'];

  function setStatus(msg, isErr) {
    statusEl.textContent = msg;
    statusEl.className = 'status' + (isErr ? ' err' : '');
  }
  function normalizeBase(raw) {
    const s = String(raw || '').trim().replace(/\/+$/, '');
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return `https://${s}`;
  }

  async function load() {
    try {
      const got = await chrome.storage.sync.get(KEYS);
      apiBaseEl.value = got.apiBase || '';
      geminiKeyEl.value = got.geminiKey || '';
      geminiModelEl.value = got.geminiModel || '';
      if (!got.apiBase) setStatus(`Using default: ${DEFAULT_LOCAL} — just run npm start. Change only when you deploy.`);
    } catch (_) {
      const got2 = await chrome.storage.local.get(KEYS).catch(() => ({}));
      apiBaseEl.value = got2.apiBase || '';
      geminiKeyEl.value = got2.geminiKey || '';
      geminiModelEl.value = got2.geminiModel || '';
    }
  }

  async function save() {
    // Empty apiBase is allowed — means "use DEFAULT_LOCAL"
    const rawBase = String(apiBaseEl.value || '').trim();
    const apiBase = rawBase ? normalizeBase(rawBase) : '';
    const geminiKey = String(geminiKeyEl.value || '').trim();
    const geminiModel = String(geminiModelEl.value || '').trim();
    if (apiBase) {
      try { new URL(apiBase); } catch (_) { setStatus('API Base URL looks invalid. Example: https://your-app.vercel.app', true); return; }
    }
    if (geminiKey && !/^AIza[0-9A-Za-z_-]{30,}$/.test(geminiKey)) {
      setStatus('Gemini key does not look like a valid Google AI key (starts with AIza…). Clear it or fix it.', true);
      return;
    }
    const data = { apiBase, geminiKey, geminiModel };
    try { await chrome.storage.sync.set(data); } catch (_) { await chrome.storage.local.set(data); }
    const effective = apiBase || DEFAULT_LOCAL;
    setStatus(`Saved ✓ — effective API: ${effective}`);
  }

  async function testConnection() {
    const rawBase = String(apiBaseEl.value || '').trim();
    const apiBase = rawBase ? normalizeBase(rawBase) : DEFAULT_LOCAL;
    const url = `${apiBase.replace(/\/+$/, '')}/api/health`;
    setStatus('Testing…');
    testBtn.disabled = true;
    try {
      const headers = {};
      const k = String(geminiKeyEl.value || '').trim();
      if (/^AIza[0-9A-Za-z_-]{30,}$/.test(k)) headers['x-gemini-key'] = k;
      const r = await fetch(url, { headers });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setStatus(`OK ✓ — ${apiBase} (ai: ${j.ai ? 'on' : 'off — set GEMINI_API_KEY on server or add personal key above'})`);
    } catch (e) {
      const hint = apiBase === DEFAULT_LOCAL ? ' — is npm start running?' : ' — check the URL and CORS.';
      setStatus(`Failed: ${e.message || e}${hint}`, true);
    } finally {
      testBtn.disabled = false;
    }
  }

  async function resetToLocal() {
    apiBaseEl.value = '';
    await save();
    setStatus(`Reset ✓ — back to default ${DEFAULT_LOCAL}`);
  }

  saveBtn.addEventListener('click', save);
  testBtn.addEventListener('click', testConnection);
  if (resetBtn) resetBtn.addEventListener('click', resetToLocal);
  ;[apiBaseEl, geminiKeyEl, geminiModelEl].forEach((el) => {
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  });
  load();
})();
