const form = document.getElementById('form');
const urlInput = document.getElementById('url');
const submitBtn = document.getElementById('submitBtn');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');
const pasteBtn = document.getElementById('pasteBtn');

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

function setLoading(v){
  submitBtn.classList.toggle('is-loading', v);
  submitBtn.disabled = v;
  urlInput.disabled = v;
  statusEl.textContent = v ? 'Fetching transcript…' : '';
}
function showError(msg){
  errorEl.textContent = msg;
  errorEl.hidden = !msg;
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
