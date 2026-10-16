/* TranscriptGen popup — Draggable, Zoomable, Zero-config Local + Deployed Backend */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const DEFAULT_API_BASE = 'http://localhost:3000';
  const STORAGE_KEYS = ['apiBase', 'geminiKey', 'geminiModel'];
  const ZOOM_KEY = 'tg_ui_zoom';
  const BOUNDS_KEY = 'tg_window_bounds';
  const CACHED_TRANSCRIPT_KEY = 'tg_cached_transcript';

  // DOM elements
  const apiBadge = $('#apiBadge');
  const useCurrentTabBtn = $('#useCurrentTab');
  const openOptionsBtn = $('#openOptions');
  const openWebBtn = $('#openWeb');
  const detachBtn = $('#detachBtn');
  const zoomInBtn = $('#zoomIn');
  const zoomOutBtn = $('#zoomOut');
  const zoomResetBtn = $('#zoomReset');

  const tabUrl = $('#tabUrl');
  const tabPaste = $('#tabPaste');
  const formUrl = $('#formUrl');
  const formPaste = $('#formPaste');
  const urlInput = $('#url');
  const pasteTitleInput = $('#pasteTitle');
  const pastedTextInput = $('#pastedText');
  const pasteBtn = $('#pasteBtn');
  const pasteClipBtn = $('#pasteClipBtn');
  const submitUrlBtn = $('#submitUrl');
  const submitPasteBtn = $('#submitPaste');
  const statusUrl = $('#statusUrl');
  const statusPaste = $('#statusPaste');
  const errorUrl = $('#errorUrl');
  const errorPaste = $('#errorPaste');

  const resultEl = $('#result');
  const videoTitleEl = $('#videoTitle');
  const metaEl = $('#meta');
  const openYtEl = $('#openYt');
  const transcriptPlainEl = $('#transcriptPlain');
  const transcriptTsEl = $('#transcriptTs');
  const segmentsListEl = $('#segmentsList');
  const footStatsEl = $('#footStats');
  const copyBtn = $('#copyBtn');
  const copyTsBtn = $('#copyTsBtn');
  const downloadBtn = $('#downloadBtn');
  const clearBtn = $('#clearBtn');
  const toastEl = $('#toast');

  const aiCard = $('#aiCard');
  const generateBtn = $('#generateBtn');
  const aiStatus = $('#aiStatus');
  const aiError = $('#aiError');
  const aiSkeleton = $('#aiSkeleton');
  const aiContent = $('#aiContent');
  const aiFootMeta = $('#aiFootMeta');
  const aiPanelNotes = $('#aiPanelNotes');
  const aiPanelSummary = $('#aiPanelSummary');
  const aiPanelGlossary = $('#aiPanelGlossary');
  const aiPanelQuiz = $('#aiPanelQuiz');
  const aiPanelChat = $('#aiPanelChat');
  const chatLog = $('#chatLog');
  const chatForm = $('#chatForm');
  const chatInput = $('#chatInput');
  const chatSend = $('#chatSend');
  const copyPackBtn = $('#copyPackBtn');
  const downloadMdBtn = $('#downloadMdBtn');

  let lastData = null;
  let pack = null;
  let chatHistory = [];
  let settings = { apiBase: '', geminiKey: '', geminiModel: '' };
  let currentZoom = 1.0;
  const isDetached = window.location.search.includes('detached=1');

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => (toastEl.hidden = true), 2200);
  }

  // =========================================================================
  // ZOOM FUNCTIONALITY
  // =========================================================================
  const zoomLevels = [0.75, 0.85, 0.95, 1.0, 1.1, 1.25, 1.4, 1.6];

  function applyZoom(z, save = true) {
    currentZoom = Math.min(2.0, Math.max(0.65, Math.round(Number(z) * 100) / 100 || 1.0));
    document.documentElement.style.setProperty('--tg-zoom', currentZoom);
    document.body.style.zoom = currentZoom;
    if (zoomResetBtn) {
      zoomResetBtn.textContent = `${Math.round(currentZoom * 100)}%`;
    }
    if (save) {
      try {
        chrome.storage.local.set({ [ZOOM_KEY]: currentZoom });
      } catch (_) {}
    }
  }

  function zoomIn() {
    const next = zoomLevels.find((l) => l > currentZoom + 0.02) || (currentZoom + 0.15);
    applyZoom(next);
    toast(`Zoom: ${Math.round(currentZoom * 100)}%`);
  }

  function zoomOut() {
    const rev = [...zoomLevels].reverse();
    const prev = rev.find((l) => l < currentZoom - 0.02) || (currentZoom - 0.15);
    applyZoom(prev);
    toast(`Zoom: ${Math.round(currentZoom * 100)}%`);
  }

  function zoomReset() {
    applyZoom(1.0);
    toast('Zoom reset: 100%');
  }

  async function loadZoom() {
    try {
      const got = await chrome.storage.local.get(ZOOM_KEY);
      if (got && got[ZOOM_KEY]) {
        applyZoom(got[ZOOM_KEY], false);
      }
    } catch (_) {}
  }

  // Keyboard zoom shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      zoomIn();
    } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      zoomOut();
    } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      zoomReset();
    }
  });

  // Ctrl + Mouse Wheel zoom
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else if (e.deltaY > 0) zoomOut();
    }
  }, { passive: false });

  // =========================================================================
  // DETACH / DRAGGABLE WINDOW FUNCTIONALITY
  // =========================================================================
  function initDetachedMode() {
    if (isDetached) {
      document.body.classList.add('is-detached');
      if (detachBtn) {
        detachBtn.title = 'Floating window active (drag and position anywhere)';
        detachBtn.style.color = '#d6ff57';
        detachBtn.style.borderColor = 'rgba(214, 255, 87, 0.4)';
      }
      // Track bounds changes so it reopens where the user moved it
      let resizeTimer = null;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          chrome.windows.getCurrent((w) => {
            if (w && w.id) {
              chrome.storage.local.set({
                [BOUNDS_KEY]: {
                  left: w.left,
                  top: w.top,
                  width: w.width,
                  height: w.height,
                },
              }).catch(() => {});
            }
          });
        }, 500);
      });
    }
  }

  async function handleDetach() {
    if (isDetached) {
      toast('Window is already floating — drag anywhere on your screens!');
      return;
    }
    const defaultBounds = { left: 80, top: 80, width: 440, height: 720 };
    try {
      const got = await chrome.storage.local.get(BOUNDS_KEY);
      const b = Object.assign(defaultBounds, got?.[BOUNDS_KEY] || {});
      chrome.windows.create({
        url: chrome.runtime.getURL('popup.html?detached=1'),
        type: 'popup',
        width: Math.max(400, b.width),
        height: Math.max(500, b.height),
        left: Math.max(10, b.left),
        top: Math.max(10, b.top),
        focused: true,
      }, () => {
        window.close(); // Close the toolbar popup
      });
    } catch (_) {
      chrome.windows.create({
        url: chrome.runtime.getURL('popup.html?detached=1'),
        type: 'popup',
        width: 440,
        height: 720,
        focused: true,
      }, () => {
        window.close();
      });
    }
  }

  // =========================================================================
  // QUICK NAVIGATION BUTTONS (FIX FOR AI & TRANSCRIPT TABS)
  // =========================================================================
  function switchAiTab(tabName) {
    // 1. Update button styling & aria state
    $$('[data-ai-tab]').forEach((b) => {
      const on = b.dataset.aiTab === tabName;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    // 2. Explicitly toggle panels using BOTH attribute AND inline display
    $$('.ai-panel').forEach((p) => {
      const isMatch = p.dataset.panel === tabName;
      p.hidden = !isMatch;
      p.style.display = isMatch ? 'grid' : 'none';
    });
  }

  function switchTranscriptTab(tabName) {
    // 1. Update button styling & aria state
    $$('.transcript-tabs .tab').forEach((b) => {
      const on = b.dataset.tab === tabName;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    // 2. Explicitly toggle views
    if (transcriptPlainEl) {
      const on = tabName === 'plain';
      transcriptPlainEl.hidden = !on;
      transcriptPlainEl.style.display = on ? 'block' : 'none';
    }
    if (transcriptTsEl) {
      const on = tabName === 'ts';
      transcriptTsEl.hidden = !on;
      transcriptTsEl.style.display = on ? 'block' : 'none';
    }
    if (segmentsListEl) {
      const on = tabName === 'segs';
      segmentsListEl.hidden = !on;
      segmentsListEl.style.display = on ? 'grid' : 'none';
    }
  }

  // =========================================================================
  // API & BACKEND ROUTING
  // =========================================================================
  function normalizeApiBase(raw) {
    const s = String(raw || '').trim().replace(/\/+$/, '');
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    return `https://${s}`;
  }

  function getApiBase() {
    const b = normalizeApiBase(settings.apiBase);
    return b || DEFAULT_API_BASE;
  }

  function headersWithKey(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    const k = String(settings.geminiKey || '').trim();
    if (/^AIza[0-9A-Za-z_-]{30,}$/.test(k)) h['x-gemini-key'] = k;
    const m = String(settings.geminiModel || '').trim();
    if (m) h['x-gemini-model'] = m;
    return h;
  }

  async function loadSettings() {
    try {
      const got = await chrome.storage.sync.get(STORAGE_KEYS);
      settings.apiBase = got.apiBase || '';
      settings.geminiKey = got.geminiKey || '';
      settings.geminiModel = got.geminiModel || '';
    } catch (_) {
      try {
        const got2 = await chrome.storage.local.get(STORAGE_KEYS);
        settings.apiBase = got2.apiBase || '';
        settings.geminiKey = got2.geminiKey || '';
        settings.geminiModel = got2.geminiModel || '';
      } catch (_) {}
    }
    updateApiBadge();
  }

  function updateApiBadge() {
    if (!apiBadge) return;
    const base = getApiBase();
    try {
      const u = new URL(base);
      const short = u.host + (u.pathname !== '/' ? u.pathname : '');
      const isLocal = /localhost|127\.0\.0\.1/i.test(u.hostname);
      apiBadge.textContent = `API: ${short}${isLocal ? ' (local)' : ''}`;
      apiBadge.title = `${base} — change in ⚙︎ Settings for deployed URL`;
      apiBadge.className = 'api-badge ok';
    } catch (_) {
      apiBadge.textContent = `API: ${base}`;
      apiBadge.className = 'api-badge ok';
    }
    if (openWebBtn) openWebBtn.title = `Open ${base}`;
  }

  async function apiFetch(path, body) {
    const bases = [];
    const primary = getApiBase();
    if (primary) bases.push(primary);
    if (DEFAULT_API_BASE && DEFAULT_API_BASE !== primary) bases.push(DEFAULT_API_BASE);

    let lastErr = null;
    for (const base of bases) {
      const url = `${base.replace(/\/+$/, '')}${path}`;
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: headersWithKey(),
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
        return j;
      } catch (e) {
        const msg = String(e.message || '');
        const isNetwork = /Failed to fetch|NetworkError|ECONNREFUSED|TypeError/i.test(msg);
        if (isNetwork && bases.length > 1) {
          lastErr = e;
          continue;
        }
        throw e;
      }
    }
    throw lastErr || new Error('API request failed.');
  }

  function fmt(n) { return new Intl.NumberFormat().format(n); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => toast('Copied ✓'));
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Copied ✓');
    return Promise.resolve();
  }

  function setUrlLoading(v) {
    submitUrlBtn.classList.toggle('is-loading', v);
    submitUrlBtn.disabled = v;
    urlInput.disabled = v;
    statusUrl.textContent = v ? 'Fetching…' : '';
  }

  function showUrlError(msg) {
    if (!msg) {
      errorUrl.textContent = '';
      errorUrl.hidden = true;
      return;
    }
    let friendly = msg;
    if (/Failed to fetch|NetworkError|ECONNREFUSED/i.test(msg)) {
      friendly = 'Cannot connect to backend. Run `npm start` in your project terminal (http://localhost:3000), or check ⚙︎ Settings.';
    }
    errorUrl.textContent = friendly;
    errorUrl.hidden = false;
    if (/blocked|rate-limit|cloud IP|disabled/i.test(msg)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'link-btn mono';
      btn.style.cssText = 'margin-top:6px; display:block;';
      btn.textContent = '👉 Switch to Paste Transcript';
      btn.onclick = () => switchMode('paste');
      errorUrl.appendChild(document.createElement('br'));
      errorUrl.appendChild(btn);
    }
  }

  function setPasteLoading(v) {
    submitPasteBtn.classList.toggle('is-loading', v);
    submitPasteBtn.disabled = v;
    pastedTextInput.disabled = v;
    statusPaste.textContent = v ? 'Processing…' : '';
  }

  function showPasteError(msg) {
    errorPaste.textContent = msg || '';
    errorPaste.hidden = !msg;
  }

  function switchMode(mode) {
    const isUrl = mode === 'url';
    tabUrl.classList.toggle('is-active', isUrl);
    tabUrl.setAttribute('aria-selected', isUrl ? 'true' : 'false');
    tabPaste.classList.toggle('is-active', !isUrl);
    tabPaste.setAttribute('aria-selected', !isUrl ? 'true' : 'false');
    formUrl.hidden = !isUrl;
    formPaste.hidden = isUrl;
    if (isUrl) urlInput.focus();
    else pastedTextInput.focus();
  }

  // =========================================================================
  // RENDERING LOGIC
  // =========================================================================
  function render(data) {
    lastData = data;
    try {
      chrome.storage.local.set({ [CACHED_TRANSCRIPT_KEY]: data });
    } catch (_) {}

    videoTitleEl.textContent = data.title || 'Untitled';
    const m = [];
    if (data.wordCount) m.push(`<b>${fmt(data.wordCount)}</b> words`);
    if (data.charCount) m.push(`<b>${fmt(data.charCount)}</b> chars`);
    if (data.durationApprox) m.push(`~ <b>${escapeHtml(data.durationApprox)}</b>`);
    if (data.elapsedMs) m.push(`<b>${(data.elapsedMs / 1000).toFixed(1)}s</b>`);
    metaEl.innerHTML = m.join(' · ');
    openYtEl.href = data.url || `https://www.youtube.com/watch?v=${data.videoId || ''}`;

    transcriptPlainEl.textContent = `${data.title}\n\n${data.text}`;
    transcriptTsEl.textContent = `${data.title}\n\n${data.timestamped || ''}`;

    segmentsListEl.innerHTML = '';
    for (const s of (data.segments || [])) {
      const row = document.createElement('div');
      row.className = 'seg';
      const sec = Math.floor((Number(s.offset) || 0) / 1000);
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      row.innerHTML = `<span class="seg-time mono">${mm}:${ss}</span><span class="seg-text">${escapeHtml(s.text || '')}</span>`;
      segmentsListEl.appendChild(row);
    }

    footStatsEl.textContent = `${fmt(data.segmentCount || 0)} segments · ${fmt(data.wordCount || 0)} words`;
    resultEl.hidden = false;
    aiCard.hidden = false;

    // Reset view to default plain transcript
    switchTranscriptTab('plain');

    resetAI(false);
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function resetAI(clearPack = true) {
    if (clearPack) {
      pack = null;
      chatHistory = [];
    } else {
      chatHistory = [];
    }
    aiSkeleton.hidden = true;
    aiContent.hidden = true;
    aiStatus.textContent = '';
    aiError.textContent = '';
    aiError.hidden = true;
    generateBtn.classList.remove('is-loading');
    generateBtn.disabled = false;
    if (aiFootMeta) aiFootMeta.textContent = '';
    if (chatLog) chatLog.innerHTML = '';

    // Switch to notes by default
    switchAiTab('notes');
  }

  function setGenerating(v, msg) {
    generateBtn.classList.toggle('is-loading', v);
    generateBtn.disabled = v;
    aiStatus.textContent = msg || (v ? 'AI is structuring…' : '');
    aiSkeleton.hidden = !v;
    if (v) {
      aiError.textContent = '';
      aiError.hidden = true;
      aiContent.hidden = true;
    }
  }

  function showAiError(msg) {
    aiError.textContent = msg;
    aiError.hidden = !msg;
  }

  function renderPack(p) {
    // 1. Structured Notes
    if (aiPanelNotes) {
      if (!p.structuredNotes?.length) {
        aiPanelNotes.innerHTML = `<div class="mono" style="color:var(--muted); font-size:12px; padding:10px 0">No notes returned.</div>`;
      } else {
        aiPanelNotes.innerHTML = p.structuredNotes.map((sec) => `
          <div class="section-block">
            <div class="section-head">
              <span class="section-heading">${escapeHtml(sec.heading)}</span>
              ${sec.timestamp ? `<span class="ts-pill">${escapeHtml(sec.timestamp)}</span>` : ''}
            </div>
            <ul class="section-bullets">${sec.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
          </div>
        `).join('');
      }
    }

    // 2. Summary
    if (aiPanelSummary) {
      const tldr = Array.isArray(p.summaryTLDR) ? p.summaryTLDR : [];
      const detailed = typeof p.summaryDetailed === 'string' ? p.summaryDetailed : '';
      aiPanelSummary.innerHTML = `
        <div class="section-block">
          <div class="section-heading" style="margin-bottom:6px">⚡ TL;DR — 30-sec read</div>
          ${tldr.length ? `<ul class="tldr-list">${tldr.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : `<div class="mono" style="color:var(--muted); font-size:12px">No TL;DR</div>`}
          <div style="margin-top:8px"><button type="button" class="secondary-btn mono" data-copy="tldr">Copy TL;DR</button></div>
        </div>
        <div class="section-block">
          <div class="section-heading" style="margin-bottom:6px">📖 Detailed summary</div>
          <div class="detailed">${escapeHtml(detailed) || '<span style="color:var(--muted)">No summary</span>'}</div>
          <div style="margin-top:8px"><button type="button" class="secondary-btn mono" data-copy="detailed">Copy detailed</button></div>
        </div>
      `;
      aiPanelSummary.querySelectorAll('[data-copy="tldr"]').forEach((b) => b.addEventListener('click', () => copyText((p.summaryTLDR || []).map((s) => `• ${s}`).join('\n'))));
      aiPanelSummary.querySelectorAll('[data-copy="detailed"]').forEach((b) => b.addEventListener('click', () => copyText(p.summaryDetailed || '')));
    }

    // 3. Glossary
    if (aiPanelGlossary) {
      if (!p.glossary?.length) {
        aiPanelGlossary.innerHTML = `<div class="mono" style="color:var(--muted); font-size:12px; padding:10px 0">No glossary terms extracted.</div>`;
      } else {
        aiPanelGlossary.innerHTML = `
          <table class="glossary">
            <thead><tr><th>Term</th><th>Definition</th></tr></thead>
            <tbody>
              ${p.glossary.map((g) => `<tr><td>${escapeHtml(g.term)}</td><td>${escapeHtml(g.definition)}</td></tr>`).join('')}
            </tbody>
          </table>
          <div style="margin-top:8px"><button type="button" class="secondary-btn mono" id="copyGlo">Copy glossary</button></div>
        `;
        const cg = aiPanelGlossary.querySelector('#copyGlo');
        if (cg) cg.addEventListener('click', () => copyText(p.glossary.map((g) => `${g.term}: ${g.definition}`).join('\n')));
      }
    }

    // 4. Quiz (MCQs)
    if (aiPanelQuiz) {
      if (!p.quiz?.length) {
        aiPanelQuiz.innerHTML = `<div class="mono" style="color:var(--muted); font-size:12px; padding:10px 0">No quiz generated.</div>`;
      } else {
        aiPanelQuiz.innerHTML = p.quiz.map((q) => `
          <div class="quiz-q" data-qid="${q.id}">
            <div class="quiz-q-head">
              <span class="quiz-n">Q${q.id}</span>
              <span class="quiz-text">${escapeHtml(q.q)}</span>
            </div>
            <div class="quiz-opts">
              ${q.options.map((opt, i) => `
                <button type="button" class="quiz-opt" data-opt="${i}">
                  <span class="opt-letter">${String.fromCharCode(65 + i)}</span>
                  <span>${escapeHtml(opt)}</span>
                </button>
              `).join('')}
            </div>
            <div class="quiz-explain" hidden style="margin-top:6px; padding:8px 10px; border-radius:10px; border:1px solid rgba(214,255,87,.18); background:rgba(214,255,87,.07); font-size:11.5px; line-height:1.5"></div>
          </div>
        `).join('') + `<div class="mono" style="color:var(--muted); font-size:11px; margin-top:6px">Tap an option to reveal answer. Explanations are grounded in lecture.</div>`;

        aiPanelQuiz.querySelectorAll('.quiz-q').forEach((card) => {
          const qid = parseInt(card.dataset.qid, 10);
          const qObj = p.quiz.find((x) => x.id === qid);
          if (!qObj) return;
          const explainEl = card.querySelector('.quiz-explain');
          card.querySelectorAll('.quiz-opt').forEach((btn) => {
            btn.addEventListener('click', () => {
              const picked = parseInt(btn.dataset.opt, 10);
              const correct = qObj.answerIndex;
              card.querySelectorAll('.quiz-opt').forEach((b) => (b.style.pointerEvents = 'none'));
              card.querySelectorAll('.quiz-opt').forEach((b) => {
                const idx = parseInt(b.dataset.opt, 10);
                if (idx === correct) b.classList.add('correct');
                else if (idx === picked && picked !== correct) b.classList.add('wrong');
              });
              if (explainEl) {
                explainEl.hidden = false;
                const ok = picked === correct ? '✓ Correct' : `✗ Correct answer: ${qObj.answerLetter}`;
                explainEl.textContent = `${ok} — ${qObj.explanation || ''}`.trim();
              }
            });
          });
        });
      }
    }

    // 5. Chat welcome message
    if (chatLog && !chatLog.dataset.welcomed) {
      chatLog.dataset.welcomed = '1';
      appendChat('assistant', 'Study pack ready! Ask anything from this lecture — answers are grounded only in the transcript.');
    }

    // Maintain current selected tab or default to notes
    const activeTab = document.querySelector('[data-ai-tab].is-active');
    const targetTab = activeTab ? activeTab.dataset.aiTab : 'notes';
    switchAiTab(targetTab);
  }

  function buildMarkdown(p) {
    const last = lastData;
    const url = last?.url || '';
    const lines = [];
    lines.push(`# ${p.title || last?.title || 'Study Pack'}`);
    if (url) lines.push(`> Source: ${url}`);
    lines.push('', `## TL;DR`, ...(p.summaryTLDR || []).map((b) => `- ${b}`), '', `## Detailed Summary`, p.summaryDetailed || '_No summary_', '', `## Structured Notes`);
    (p.structuredNotes || []).forEach((sec) => {
      lines.push(`### ${sec.heading}${sec.timestamp ? ` — ${sec.timestamp}` : ''}`);
      sec.bullets.forEach((b) => lines.push(`- ${b}`));
      lines.push('');
    });
    lines.push(`## Glossary`, `| Term | Definition |`, `|---|---|`, ...(p.glossary || []).map((g) => `| ${g.term.replace(/\|/g, '/')} | ${g.definition.replace(/\|/g, '/')} |`), '', `## Quiz`);
    (p.quiz || []).forEach((q) => {
      lines.push(`**Q${q.id}. ${q.q}**`);
      q.options.forEach((o, i) => lines.push(`- ${String.fromCharCode(65 + i)}. ${o}`));
      lines.push(`> Answer: ${q.answerLetter} — ${q.explanation}`, '');
    });
    lines.push(`---`, `*Generated by TranscriptGen — grounded in the lecture transcript.*`);
    return lines.join('\n');
  }

  function appendChat(role, text) {
    if (!chatLog) return;
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    const label = role === 'user' ? 'You' : 'AI Tutor';
    div.innerHTML = `<div class="chat-role">${label}</div>${escapeHtml(text)}`;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  async function generate() {
    if (!lastData?.text) {
      showAiError('Extract a transcript first.');
      return;
    }
    setGenerating(true, 'AI is structuring lecture notes… ~5–10s');
    try {
      const j = await apiFetch('/api/ai/study-pack', {
        videoId: lastData.videoId,
        title: lastData.title,
        text: lastData.text,
        segments: lastData.segments,
      });
      pack = j;
      renderPack(j);
      aiContent.hidden = false;
      if (aiFootMeta) aiFootMeta.textContent = j.cached ? '· Cached' : `· ${j.model || 'gemini'}`;
      toast('AI Study Pack ready ✨');
    } catch (e) {
      showAiError(e.message || 'AI generation failed.');
    } finally {
      setGenerating(false, '');
    }
  }

  async function sendChat(e) {
    if (e) e.preventDefault();
    const q = chatInput ? chatInput.value.trim() : '';
    if (!q) return;
    if (!lastData?.text) {
      appendChat('assistant', 'Extract a transcript first.');
      return;
    }
    const question = q;
    if (chatInput) chatInput.value = '';
    appendChat('user', question);
    if (chatSend) {
      chatSend.disabled = true;
      chatSend.textContent = '…';
    }
    chatHistory.push({ role: 'user', text: question });
    try {
      const j = await apiFetch('/api/ai/chat', {
        text: lastData.text,
        title: lastData.title,
        question,
        history: chatHistory.slice(0, -1),
        videoId: lastData.videoId,
      });
      const ans = j.answer || '(empty)';
      chatHistory.push({ role: 'assistant', text: ans });
      appendChat('assistant', ans);
    } catch (err) {
      appendChat('assistant', `Error: ${err.message || 'Chat failed.'}`);
    } finally {
      if (chatSend) {
        chatSend.disabled = false;
        chatSend.textContent = 'Send';
      }
    }
  }

  // =========================================================================
  // EVENT WIRING
  // =========================================================================
  // Header buttons
  if (zoomInBtn) zoomInBtn.addEventListener('click', zoomIn);
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', zoomOut);
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', zoomReset);
  if (detachBtn) detachBtn.addEventListener('click', handleDetach);

  tabUrl.addEventListener('click', () => switchMode('url'));
  tabPaste.addEventListener('click', () => switchMode('paste'));
  openOptionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  openWebBtn.addEventListener('click', () => {
    const base = getApiBase();
    if (base) chrome.tabs.create({ url: base });
    else chrome.runtime.openOptionsPage();
  });

  useCurrentTabBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        urlInput.value = tab.url;
        toast('URL from current tab ✓');
        switchMode('url');
      } else toast('No URL on this tab');
    } catch {
      toast('Cannot read tab URL');
    }
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        urlInput.value = t.trim();
        toast('Pasted ✓');
      }
    } catch {
      urlInput.focus();
      document.execCommand('paste');
    }
  });

  pasteClipBtn.addEventListener('click', async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        pastedTextInput.value = t.trim();
        toast('Pasted ✓');
      }
    } catch {
      pastedTextInput.focus();
      document.execCommand('paste');
    }
  });

  $$('[data-ex]').forEach((b) => b.addEventListener('click', () => {
    urlInput.value = b.dataset.ex;
    formUrl.requestSubmit();
  }));

  formUrl.addEventListener('submit', async (e) => {
    e.preventDefault();
    showUrlError('');
    const url = urlInput.value.trim();
    if (!url) {
      showUrlError('Paste a YouTube URL.');
      return;
    }
    setUrlLoading(true);
    try {
      const j = await apiFetch('/api/transcript', { url, lang: 'en' });
      render(j);
      toast('Transcript ready ✓');
    } catch (err) {
      showUrlError(err.message || 'Failed.');
    } finally {
      setUrlLoading(false);
    }
  });

  formPaste.addEventListener('submit', async (e) => {
    e.preventDefault();
    showPasteError('');
    const text = pastedTextInput.value.trim();
    if (!text) {
      showPasteError('Paste transcript text.');
      return;
    }
    const title = pasteTitleInput.value.trim();
    setPasteLoading(true);
    try {
      const j = await apiFetch('/api/transcript/custom', { text, title });
      render(j);
      toast('Transcript loaded ✓');
    } catch (err) {
      showPasteError(err.message || 'Failed.');
    } finally {
      setPasteLoading(false);
    }
  });

  // Transcript tabs wiring (Plain, Timestamps, Segments)
  $$('.transcript-tabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTranscriptTab(btn.dataset.tab);
    });
  });

  // AI tabs wiring (Notes, Summary, Glossary, Quiz, Chat)
  $$('[data-ai-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchAiTab(btn.dataset.aiTab);
    });
  });

  copyBtn.addEventListener('click', () => lastData && copyText(`${lastData.title}\n\n${lastData.text}`));
  copyTsBtn.addEventListener('click', () => lastData && copyText(`${lastData.title}\n\n${lastData.timestamped || ''}`));
  downloadBtn.addEventListener('click', () => {
    if (!lastData) return;
    const safe = (lastData.title || 'transcript').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80).trim() || 'transcript';
    const blob = new Blob([`${lastData.title}\n${lastData.url || ''}\n\n${lastData.text}\n`], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${safe}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
    toast('Downloaded ✓');
  });

  clearBtn.addEventListener('click', () => {
    resultEl.hidden = true;
    aiCard.hidden = true;
    lastData = null;
    pack = null;
    chatHistory = [];
    urlInput.value = '';
    pastedTextInput.value = '';
    pasteTitleInput.value = '';
    showUrlError('');
    showPasteError('');
    statusUrl.textContent = '';
    statusPaste.textContent = '';
    resetAI(true);
    try {
      chrome.storage.local.remove(CACHED_TRANSCRIPT_KEY);
    } catch (_) {}
  });

  generateBtn.addEventListener('click', generate);
  chatForm.addEventListener('submit', sendChat);
  copyPackBtn.addEventListener('click', () => {
    if (!pack) return;
    copyText(buildMarkdown(pack));
  });
  downloadMdBtn.addEventListener('click', () => {
    if (!pack) return;
    const safe = (pack.title || lastData?.title || 'study-pack').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80).trim() || 'study-pack';
    const md = buildMarkdown(pack);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${safe} — Study Pack.md`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
    toast('Study Pack downloaded ✓');
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      formUrl.requestSubmit();
    }
  });

  // =========================================================================
  // INITIALIZATION
  // =========================================================================
  loadSettings();
  loadZoom();
  initDetachedMode();

  try {
    chrome.storage.onChanged.addListener(() => loadSettings());
  } catch (_) {}

  // Auto-fill from active YouTube tab on popup open
  (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const u = tab?.url || '';
      if (/youtube\.com\/watch|youtu\.be\//i.test(u) && !urlInput.value) {
        urlInput.value = u;
      }
    } catch (_) {}
  })();
})();
