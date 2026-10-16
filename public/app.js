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
