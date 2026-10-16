const form = document.getElementById('form');
const urlInput = document.getElementById('url');
const submitBtn = document.getElementById('submitBtn');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const pasteBtn = document.getElementById('pasteBtn');

// Mode Switcher & Paste form elements
const tabModeUrl = document.getElementById('tabModeUrl');
const tabModePaste = document.getElementById('tabModePaste');
const tabModeBatch = document.getElementById('tabModeBatch');
const pasteForm = document.getElementById('pasteForm');
const pasteTitleInput = document.getElementById('pasteTitle');
const pastedTextInput = document.getElementById('pastedText');
const submitPasteBtn = document.getElementById('submitPasteBtn');
const pasteClipboardBtn = document.getElementById('pasteClipboardBtn');
const pasteStatusEl = document.getElementById('pasteStatus');
const pasteErrorEl = document.getElementById('pasteError');

// Batch Form & Result elements
const batchForm = document.getElementById('batchForm');
const batchUrlsInput = document.getElementById('batchUrls');
const submitBatchBtn = document.getElementById('submitBatchBtn');
const batchPasteClipBtn = document.getElementById('batchPasteClipBtn');
const batchSampleBtn = document.getElementById('batchSampleBtn');
const batchClearInputBtn = document.getElementById('batchClearInputBtn');
const batchCountText = document.getElementById('batchCountText');
const batchProgressWrap = document.getElementById('batchProgressWrap');
const batchProgressLabel = document.getElementById('batchProgressLabel');
const batchProgressPercent = document.getElementById('batchProgressPercent');
const batchProgressBar = document.getElementById('batchProgressBar');
const batchStatusEl = document.getElementById('batchStatus');
const batchErrorEl = document.getElementById('batchError');

const batchResult = document.getElementById('batchResult');
const batchMainTitle = document.getElementById('batchMainTitle');
const batchMeta = document.getElementById('batchMeta');
const downloadBatchAllBtn = document.getElementById('downloadBatchAllBtn');
const copyBatchAllBtn = document.getElementById('copyBatchAllBtn');
const clearBatchResultBtn = document.getElementById('clearBatchResultBtn');
const batchItemsList = document.getElementById('batchItemsList');
const batchFootStats = document.getElementById('batchFootStats');
const scrollUpBatchBtn = document.getElementById('scrollUpBatchBtn');

const result = document.getElementById('result');
const videoTitleEl = document.getElementById('videoTitle');
const metaEl = document.getElementById('meta');
const transcriptTextEl = document.getElementById('transcriptText');
const transcriptTsEl = document.getElementById('transcriptTs');
const segmentsListEl = document.getElementById('segmentsList');
const openYtEl = document.getElementById('openYt');
const footStatsEl = document.getElementById('footStats');

const copyBtn = document.getElementById('copyBtn');
const copyTsBtn = document.getElementById('copyTsBtn');
const downloadBtn = document.getElementById('downloadBtn');
const clearBtn = document.getElementById('clearBtn');
const toastEl = document.getElementById('toast');

// expose for ai.js
window.__transcriptState = { last: null };

function toast(msg){
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toastEl._t = setTimeout(()=> toastEl.hidden = true, 2200);
}
window.toast = toast;

function switchMode(mode){
  if (!tabModeUrl || !tabModePaste) return;
  const tabs = [
    { name: 'url', btn: tabModeUrl, el: form, focusEl: urlInput },
    { name: 'paste', btn: tabModePaste, el: pasteForm, focusEl: pastedTextInput },
    { name: 'batch', btn: tabModeBatch, el: batchForm, focusEl: batchUrlsInput },
  ];

  tabs.forEach(t => {
    if (!t.btn || !t.el) return;
    const isTarget = t.name === mode;
    t.btn.classList.toggle('is-active', isTarget);
    t.btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    t.el.hidden = !isTarget;
    if (isTarget && t.focusEl) t.focusEl.focus();
  });

  // When switching modes, hide contrasting result areas to prevent visual confusion
  if (mode === 'batch') {
    if (result) result.hidden = true;
    const aiCard = document.getElementById('aiCard');
    if (aiCard) aiCard.hidden = true;
    if (batchResults.length && batchResult) batchResult.hidden = false;
  } else {
    if (batchResult) batchResult.hidden = true;
    if (window.__transcriptState?.last && result) {
      result.hidden = false;
      const aiCard = document.getElementById('aiCard');
      if (aiCard) aiCard.hidden = false;
    }
  }
}
window.switchMode = switchMode;

if (tabModeUrl) tabModeUrl.addEventListener('click', () => switchMode('url'));
if (tabModePaste) tabModePaste.addEventListener('click', () => switchMode('paste'));
if (tabModeBatch) tabModeBatch.addEventListener('click', () => switchMode('batch'));

function setLoading(v){
  submitBtn.classList.toggle('is-loading', v);
  submitBtn.disabled = v;
  urlInput.disabled = v;
  statusEl.textContent = v ? 'Fetching transcript…' : '';
}
function showError(msg){
  if (!msg) {
    errorEl.textContent = '';
    errorEl.hidden = true;
    return;
  }
  errorEl.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = msg;
  errorEl.appendChild(span);

  if (/blocked|rate-limit|cloud IP|disabled/i.test(msg)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'link-btn';
    btn.style.cssText = 'color:#d6ff57; font-weight:600; margin-top:6px; display:block;';
    btn.textContent = '👉 Switch to "Paste Transcript" mode';
    btn.onclick = () => switchMode('paste');
    errorEl.appendChild(btn);
  }
  errorEl.hidden = false;
}
function fmt(n){ return new Intl.NumberFormat().format(n); }

function render(data){
  window.__transcriptState.last = data;
  videoTitleEl.textContent = data.title || 'Untitled';
  const m = [];
  if (data.wordCount) m.push(`<b>${fmt(data.wordCount)}</b> words`);
  if (data.charCount) m.push(`<b>${fmt(data.charCount)}</b> chars`);
  if (data.durationApprox) m.push(`~ <b>${data.durationApprox}</b>`);
  if (data.elapsedMs) m.push(`<b>${(data.elapsedMs/1000).toFixed(1)}s</b>`);
  metaEl.innerHTML = m.join(' · ');
  openYtEl.href = data.url;

  transcriptTextEl.textContent = `${data.title}\n\n${data.text}`;
  transcriptTsEl.textContent = `${data.title}\n\n${data.timestamped}`;

  segmentsListEl.innerHTML = '';
  for (const s of data.segments){
    const row = document.createElement('div');
    row.className = 'seg';
    // offsets from youtube-transcript are in ms
    const sec = Math.floor((Number(s.offset)||0) / 1000);
    const mm = Math.floor(sec/60);
    const ss = sec % 60;
    const ts = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
    row.innerHTML = `<span class="seg-time mono">${ts}</span><span class="seg-text">${escapeHtml(s.text)}</span>`;
    segmentsListEl.appendChild(row);
  }

  footStatsEl.textContent = `${fmt(data.segmentCount)} segments · ${fmt(data.wordCount)} words`;
  result.hidden = false;

  // reveal AI card on-demand area and reset its state for new video
  const aiCard = document.getElementById('aiCard');
  if (aiCard) {
    aiCard.hidden = false;
    // reset AI state via ai.js hook if present
    if (window.__aiReset) window.__aiReset();
    aiCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
window.escapeHtml = escapeHtml;

async function extract(url){
  showError('');
  if (!url || !url.trim()){ showError('Please paste a YouTube URL.'); return; }
  setLoading(true);
  try{
    const r = await fetch('/api/transcript', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ url, lang: 'en' })
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
    render(j);
    toast('Transcript ready ✓ — now generate AI study notes below');
  }catch(e){
    showError(e.message || 'Something went wrong.');
  }finally{
    setLoading(false);
  }
}

form.addEventListener('submit', (e)=>{
  e.preventDefault();
  extract(urlInput.value);
});

function setPasteLoading(v){
  if (!submitPasteBtn) return;
  submitPasteBtn.classList.toggle('is-loading', v);
  submitPasteBtn.disabled = v;
  if (pastedTextInput) pastedTextInput.disabled = v;
  if (pasteStatusEl) pasteStatusEl.textContent = v ? 'Processing transcript…' : '';
}
function showPasteError(msg){
  if (!pasteErrorEl) return;
  pasteErrorEl.textContent = msg;
  pasteErrorEl.hidden = !msg;
}

if (pasteForm) {
  pasteForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    showPasteError('');
    const text = (pastedTextInput?.value || '').trim();
    if (!text){
      showPasteError('Please paste transcript or lecture text.');
      return;
    }
    const title = (pasteTitleInput?.value || '').trim();
    setPasteLoading(true);
    try{
      const r = await fetch('/api/transcript/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, title })
      });
      const j = await r.json().catch(()=> ({}));
      if (!r.ok) throw new Error(j.error || `Processing failed (${r.status})`);
      render(j);
      toast('Transcript loaded ✓ — now generate AI study notes below');
    }catch(err){
      showPasteError(err.message || 'Failed to process pasted transcript.');
    }finally{
      setPasteLoading(false);
    }
  });
}

if (pasteClipboardBtn) {
  pasteClipboardBtn.addEventListener('click', async ()=>{
    try{
      const t = await navigator.clipboard.readText();
      if (t){
        pastedTextInput.value = t.trim();
        pastedTextInput.focus();
        toast('Pasted from clipboard ✓');
      }
    }catch{
      pastedTextInput.focus();
      document.execCommand('paste');
    }
  });
}

// Tabs (result card only)
document.querySelectorAll('#result .tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#result .tab').forEach(b=>{ b.classList.remove('is-active'); b.setAttribute('aria-selected','false'); });
    btn.classList.add('is-active'); btn.setAttribute('aria-selected','true');
    const tab = btn.dataset.tab;
    transcriptTextEl.hidden = tab !== 'plain';
    transcriptTsEl.hidden = tab !== 'timestamped';
    segmentsListEl.hidden = tab !== 'segments';
  });
});

pasteBtn.addEventListener('click', async ()=>{
  try{
    const t = await navigator.clipboard.readText();
    if (t){ urlInput.value = t.trim(); urlInput.focus(); toast('Pasted ✓'); }
  }catch{
    urlInput.focus();
    document.execCommand('paste');
  }
});

document.querySelectorAll('[data-example]').forEach(b=>{
  b.addEventListener('click', ()=>{
    urlInput.value = b.dataset.example;
    extract(urlInput.value);
  });
});

async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
    toast('Copied ✓');
  }catch{
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast('Copied ✓');
  }
}
window.copyText = copyText;

copyBtn.addEventListener('click', ()=>{
  const last = window.__transcriptState.last;
  if (!last) return;
  copyText(`${last.title}\n\n${last.text}`);
});
copyTsBtn.addEventListener('click', ()=>{
  const last = window.__transcriptState.last;
  if (!last) return;
  copyText(`${last.title}\n\n${last.timestamped}`);
});
downloadBtn.addEventListener('click', ()=>{
  const last = window.__transcriptState.last;
  if (!last) return;
  const safe = (last.title || 'transcript').replace(/[\\/:*?"<>|]+/g,' ').slice(0,80).trim() || 'transcript';
  const blob = new Blob([`${last.title}\n${last.url}\n\n${last.text}\n`], { type:'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safe}.txt`;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Downloaded ✓');
});
clearBtn.addEventListener('click', ()=>{
  result.hidden = true;
  const aiCard = document.getElementById('aiCard');
  if (aiCard) aiCard.hidden = true;
  window.__transcriptState.last = null;
  urlInput.value = '';
  urlInput.focus();
  showError('');
  statusEl.textContent = '';
  if (window.__aiReset) window.__aiReset();
});

urlInput.addEventListener('keydown', (e)=>{
  if (e.key === 'Enter'){ e.preventDefault(); extract(urlInput.value); }
});

// ==========================================================================
// BATCH URL EXTRACTION (WEB ONLY — NO LIMITS, NO AI OVERHEAD, SINGLE .TXT)
// ==========================================================================
let batchResults = []; // Array of { ok, url, data?, error? }
const YT_GLOBAL_RE = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})|([a-zA-Z0-9_-]{11})/gi;

function parseBatchUrls(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const tokens = rawText.split(/[\r\n,\s]+/).map(t => t.trim()).filter(Boolean);
  const found = [];
  const seen = new Set();

  for (const token of tokens) {
    // Try full match or regex match
    let vid = null;
    let url = token;
    const m = token.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (m && m[1]) {
      vid = m[1];
      url = token.startsWith('http') ? token : `https://${token}`;
    } else if (/^[a-zA-Z0-9_-]{11}$/.test(token)) {
      vid = token;
      url = `https://www.youtube.com/watch?v=${token}`;
    }

    if (vid && !seen.has(vid)) {
      seen.add(vid);
      found.push({ videoId: vid, url });
    }
  }
  return found;
}

function updateBatchCounter() {
  if (!batchUrlsInput || !batchCountText) return;
  const links = parseBatchUrls(batchUrlsInput.value);
  batchCountText.textContent = `${links.length} ${links.length === 1 ? 'link' : 'links'} detected`;
  if (submitBatchBtn) {
    const label = submitBatchBtn.querySelector('.btn-label');
    if (label && !submitBatchBtn.classList.contains('is-loading')) {
      label.textContent = links.length ? `Extract All (${links.length} Transcripts)` : 'Extract All Transcripts';
    }
  }
}

if (batchUrlsInput) {
  batchUrlsInput.addEventListener('input', updateBatchCounter);
  batchUrlsInput.addEventListener('paste', () => setTimeout(updateBatchCounter, 50));
}

if (batchPasteClipBtn) {
  batchPasteClipBtn.addEventListener('click', async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        batchUrlsInput.value = (batchUrlsInput.value ? batchUrlsInput.value.trim() + '\n' : '') + clipText.trim();
        updateBatchCounter();
        toast('Pasted from clipboard ✓');
      }
    } catch (_) {
      batchUrlsInput.focus();
      document.execCommand('paste');
      setTimeout(updateBatchCounter, 100);
    }
  });
}

if (batchSampleBtn) {
  batchSampleBtn.addEventListener('click', () => {
    const samples = [
      'https://www.youtube.com/watch?v=7ZQbS0bCMlg', // BGP Lecture
      'https://youtu.be/jNQXAC9IVRw',                 // Me at the zoo
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'  // Classic
    ];
    batchUrlsInput.value = samples.join('\n');
    updateBatchCounter();
    toast('Loaded 3 sample links ✓');
  });
}

if (batchClearInputBtn) {
  batchClearInputBtn.addEventListener('click', () => {
    batchUrlsInput.value = '';
    updateBatchCounter();
    showBatchError('');
    if (batchStatusEl) batchStatusEl.textContent = '';
  });
}

function setBatchLoading(v, progressLabel = '') {
  if (!submitBatchBtn) return;
  submitBatchBtn.classList.toggle('is-loading', v);
  submitBatchBtn.disabled = v;
  if (batchUrlsInput) batchUrlsInput.disabled = v;
  if (batchProgressWrap) batchProgressWrap.hidden = !v;
  if (progressLabel && batchProgressLabel) batchProgressLabel.textContent = progressLabel;
}

function showBatchError(msg) {
  if (!batchErrorEl) return;
  batchErrorEl.textContent = msg || '';
  batchErrorEl.hidden = !msg;
}

function appendBatchCard(data, idx, rawUrl) {
  if (!batchItemsList) return;
  const card = document.createElement('div');
  card.className = 'batch-card';
  card.id = `batchItem_${idx}`;

  const sec = data.durationApprox || 'Unknown';
  card.innerHTML = `
    <div class="batch-card-head" role="button" tabindex="0" title="Click to view/hide transcript">
      <div class="batch-card-info">
        <div class="batch-card-index mono">#${idx} · Video Transcript</div>
        <div class="batch-card-title">${escapeHtml(data.title || 'YouTube Video')}</div>
        <div class="batch-card-meta mono">
          <span>~ <b>${escapeHtml(sec)}</b></span>
          <span><b>${fmt(data.wordCount || 0)}</b> words</span>
          <span><b>${fmt(data.segmentCount || 0)}</b> segments</span>
          ${data.elapsedMs ? `<span>${(data.elapsedMs / 1000).toFixed(1)}s</span>` : ''}
        </div>
      </div>
      <div class="batch-card-actions">
        <span class="batch-status-pill ready">✓ Ready</span>
        <button type="button" class="secondary-btn mono" data-copy-idx="${idx}">⧉ Copy</button>
        <a href="${escapeHtml(data.url || rawUrl)}" target="_blank" rel="noopener" class="secondary-btn mono">YouTube ↗</a>
        <span class="batch-card-toggle">▾ View</span>
      </div>
    </div>
    <div class="batch-card-body" hidden>
      <pre class="transcript ts">${escapeHtml(data.title)}\n${escapeHtml(data.url)}\n\n${escapeHtml(data.timestamped || data.text)}</pre>
    </div>
  `;

  // Toggle accordion on header click
  const head = card.querySelector('.batch-card-head');
  const body = card.querySelector('.batch-card-body');
  const toggleSpan = card.querySelector('.batch-card-toggle');

  head.addEventListener('click', (e) => {
    // Ignore if clicking action buttons or links
    if (e.target.closest('button') || e.target.closest('a')) return;
    const isHidden = body.hidden;
    body.hidden = !isHidden;
    toggleSpan.textContent = isHidden ? '▴ Hide' : '▾ View';
  });

  // Individual copy button
  const cpBtn = card.querySelector(`[data-copy-idx="${idx}"]`);
  if (cpBtn) {
    cpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyText(`${data.title}\n${data.url}\n\n${data.timestamped || data.text}`);
    });
  }

  batchItemsList.appendChild(card);
}

function appendBatchCardError(errMsg, idx, rawUrl) {
  if (!batchItemsList) return;
  const card = document.createElement('div');
  card.className = 'batch-card has-error';
  card.id = `batchItem_${idx}`;

  card.innerHTML = `
    <div class="batch-card-head">
      <div class="batch-card-info">
        <div class="batch-card-index mono">#${idx} · Extraction Error</div>
        <div class="batch-card-title">${escapeHtml(rawUrl)}</div>
        <div class="batch-card-meta mono" style="color:#ffd1ce">
          <span>⚠️ ${escapeHtml(errMsg || 'Transcript unavailable')}</span>
        </div>
      </div>
      <div class="batch-card-actions">
        <span class="batch-status-pill failed">✗ Failed</span>
        <a href="${escapeHtml(rawUrl)}" target="_blank" rel="noopener" class="secondary-btn mono">YouTube ↗</a>
      </div>
    </div>
  `;
  batchItemsList.appendChild(card);
}

function buildCompiledBatchText(results) {
  const successful = results.filter(r => r.ok && r.data);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const totalWords = successful.reduce((acc, r) => acc + (r.data.wordCount || 0), 0);
  const totalSegments = successful.reduce((acc, r) => acc + (r.data.segmentCount || 0), 0);

  const lines = [];
  lines.push('================================================================================');
  lines.push('TRANSCRIPTGEN — BATCH TRANSCRIPT COLLECTION');
  lines.push(`Exported: ${now}`);
  lines.push(`Total Requested: ${results.length} | Successful: ${successful.length} | Failed: ${results.length - successful.length}`);
  lines.push(`Total Word Count: ${fmt(totalWords)} words | Total Segments: ${fmt(totalSegments)}`);
  lines.push('Note: All transcripts below include video titles, URLs, stats, and timestamped lines.');
  lines.push('================================================================================');
  lines.push('');

  results.forEach((item, index) => {
    const num = index + 1;
    lines.push('================================================================================');
    if (item.ok && item.data) {
      const d = item.data;
      lines.push(`[VIDEO ${num} OF ${results.length}]`);
      lines.push(`TITLE:    ${d.title || 'Untitled'}`);
      lines.push(`URL:      ${d.url || item.url}`);
      lines.push(`DURATION: ~${d.durationApprox || 'Unknown'}`);
      lines.push(`STATS:    ${fmt(d.segmentCount || 0)} segments · ${fmt(d.wordCount || 0)} words`);
      lines.push('================================================================================');
      lines.push('');
      lines.push(d.timestamped || d.text || '(empty transcript)');
    } else {
      lines.push(`[VIDEO ${num} OF ${results.length} - FAILED]`);
      lines.push(`URL:      ${item.url}`);
      lines.push(`ERROR:    ${item.error || 'Failed to extract transcript'}`);
      lines.push('================================================================================');
      lines.push('(No transcript available for this video)');
    }
    lines.push('');
    lines.push('');
  });

  lines.push('================================================================================');
  lines.push('End of TranscriptGen Batch Collection');
  lines.push('================================================================================');
  return lines.join('\n');
}

if (batchForm) {
  batchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showBatchError('');
    const raw = (batchUrlsInput?.value || '').trim();
    const urls = parseBatchUrls(raw);

    if (!urls.length) {
      showBatchError('Please paste at least one valid YouTube video link or video ID.');
      return;
    }

    // Reset results state
    batchResults = [];
    if (batchItemsList) batchItemsList.innerHTML = '';
    if (batchResult) batchResult.hidden = true;

    // Hide single-video result & AI card to prevent visual clutter
    if (result) result.hidden = true;
    const aiCard = document.getElementById('aiCard');
    if (aiCard) aiCard.hidden = true;

    setBatchLoading(true, `Starting batch of ${urls.length} ${urls.length === 1 ? 'video' : 'videos'}…`);
    if (batchProgressBar) batchProgressBar.style.width = '0%';
    if (batchProgressPercent) batchProgressPercent.textContent = '0%';

    const tStart = Date.now();
    let completedCount = 0;
    let successCount = 0;

    // Process sequentially or with controlled small concurrency to avoid YouTube spam throttling
    for (let i = 0; i < urls.length; i++) {
      const item = urls[i];
      const idx = i + 1;
      const pct = Math.round((i / urls.length) * 100);

      if (batchProgressBar) batchProgressBar.style.width = `${pct}%`;
      if (batchProgressPercent) batchProgressPercent.textContent = `${pct}%`;
      if (batchProgressLabel) {
        batchProgressLabel.textContent = `Extracting ${idx} of ${urls.length}: "${item.url.slice(0, 48)}…"`;
      }

      try {
        const r = await fetch('/api/transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.url, lang: 'en' })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);

        batchResults.push({ ok: true, url: item.url, data: j });
        appendBatchCard(j, idx, item.url);
        successCount++;
      } catch (err) {
        const msg = err.message || 'Extraction failed.';
        batchResults.push({ ok: false, url: item.url, error: msg });
        appendBatchCardError(msg, idx, item.url);
      }

      completedCount++;
      const currentPct = Math.round((completedCount / urls.length) * 100);
      if (batchProgressBar) batchProgressBar.style.width = `${currentPct}%`;
      if (batchProgressPercent) batchProgressPercent.textContent = `${currentPct}%`;
    }

    const tTotal = Date.now() - tStart;
    setBatchLoading(false);

    // Finalize statistics
    const totalWords = batchResults.reduce((acc, r) => acc + (r.ok && r.data ? r.data.wordCount || 0 : 0), 0);
    const totalSegments = batchResults.reduce((acc, r) => acc + (r.ok && r.data ? r.data.segmentCount || 0 : 0), 0);

    if (batchMainTitle) {
      batchMainTitle.textContent = `Batch Collection: ${successCount} of ${urls.length} Ready`;
    }
    if (batchMeta) {
      const metaItems = [
        `<b>${successCount}/${urls.length}</b> successful`,
        `<b>${fmt(totalWords)}</b> total words`,
        `<b>${fmt(totalSegments)}</b> segments`,
        `<b>${(tTotal / 1000).toFixed(1)}s</b> elapsed`
      ];
      batchMeta.innerHTML = metaItems.join(' · ');
    }
    if (batchFootStats) {
      batchFootStats.textContent = `${successCount} transcripts ready · ${fmt(totalWords)} words · Compiled .txt available below`;
    }

    if (batchResult) {
      batchResult.hidden = false;
      batchResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    toast(`Batch complete: ${successCount} of ${urls.length} transcripts extracted ✓`);
  });
}

// Download Compiled .txt
if (downloadBatchAllBtn) {
  downloadBatchAllBtn.addEventListener('click', () => {
    if (!batchResults.length) return;
    const successful = batchResults.filter(r => r.ok && r.data);
    if (!successful.length) {
      toast('No successful transcripts to download.');
      return;
    }
    const compiled = buildCompiledBatchText(batchResults);
    const safeDate = new Date().toISOString().slice(0, 10);
    const filename = `TranscriptGen_Batch_${successful.length}_Videos_${safeDate}.txt`;

    const blob = new Blob([compiled], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast(`Downloaded single .txt file (${successful.length} transcripts) ✓`);
  });
}

// Copy All Transcripts
if (copyBatchAllBtn) {
  copyBatchAllBtn.addEventListener('click', () => {
    if (!batchResults.length) return;
    const compiled = buildCompiledBatchText(batchResults);
    copyText(compiled);
    toast(`Copied all ${batchResults.length} transcripts with headings ✓`);
  });
}

// Clear Batch Results
if (clearBatchResultBtn) {
  clearBatchResultBtn.addEventListener('click', () => {
    batchResults = [];
    if (batchItemsList) batchItemsList.innerHTML = '';
    if (batchResult) batchResult.hidden = true;
    if (batchUrlsInput) {
      batchUrlsInput.value = '';
      updateBatchCounter();
      batchUrlsInput.focus();
    }
    toast('Batch cleared');
  });
}

// Scroll to top
if (scrollUpBatchBtn) {
  scrollUpBatchBtn.addEventListener('click', () => {
    if (batchForm) batchForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
