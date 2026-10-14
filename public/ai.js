/**
 * TranscriptGen AI — Study Pack + Chat
 * Depends on app.js (window.__transcriptState, window.toast, window.escapeHtml, window.copyText)
 */
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const generateBtn = $('#generateBtn');
  const aiStatus = $('#aiStatus');
  const aiError = $('#aiError');
  const aiSkeleton = $('#aiSkeleton');
  const aiContent = $('#aiContent');
  const aiFootMeta = $('#aiFootMeta');
  const chatLog = $('#chatLog');
  const chatForm = $('#chatForm');
  const chatInput = $('#chatInput');
  const chatSend = $('#chatSend');
  const copyStudyPackBtn = $('#copyStudyPackBtn');
  const downloadMdBtn = $('#downloadMdBtn');

  let pack = null;
  let chatHistory = [];

  function showAiError(msg) {
    aiError.textContent = msg;
    aiError.hidden = !msg;
  }

  window.__aiReset = function resetAI() {
    pack = null;
    chatHistory = [];
    if (aiSkeleton) aiSkeleton.hidden = true;
    if (aiContent) aiContent.hidden = true;
    if (aiStatus) aiStatus.textContent = '';
    showAiError('');
    if (generateBtn) {
      generateBtn.classList.remove('is-loading');
      generateBtn.disabled = false;
    }
    if (chatLog) chatLog.innerHTML = '';
    if (aiFootMeta) aiFootMeta.textContent = '';
    // reset to notes tab
    document.querySelectorAll('[data-ai-tab]').forEach(b => {
      const on = b.dataset.aiTab === 'notes';
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.ai-panel').forEach(p => {
      p.hidden = p.dataset.panel !== 'notes';
    });
  };

  function escapeHtml(s) {
    return (window.escapeHtml || (x => x))(s);
  }

  function setGenerating(v, msg) {
    if (!generateBtn) return;
    generateBtn.classList.toggle('is-loading', v);
    generateBtn.disabled = v;
    if (aiStatus) aiStatus.textContent = msg || (v ? 'AI is structuring your lecture…' : '');
    if (aiSkeleton) aiSkeleton.hidden = !v;
    if (v) {
      showAiError('');
      if (aiContent) aiContent.hidden = true;
    }
  }

  async function generate() {
    const last = window.__transcriptState?.last;
    if (!last || !last.text) {
      showAiError('Extract a transcript first, then generate AI notes.');
      return;
    }
    setGenerating(true, 'AI is structuring your lecture… this takes ~5–10s');
    try {
      const r = await fetch('/api/ai/study-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: last.videoId,
          title: last.title,
          text: last.text,
          segments: last.segments,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `AI failed (${r.status})`);
      pack = j;
      renderPack(j);
      if (aiContent) aiContent.hidden = false;
      if (aiFootMeta) aiFootMeta.textContent = j.cached ? '· Cached' : `· ${j.model || 'gemini'}`;
      window.toast && window.toast('AI Study Pack ready ✨');
    } catch (e) {
      showAiError(e.message || 'AI request failed.');
    } finally {
      setGenerating(false, '');
    }
  }

  function renderPack(p) {
    // Notes
    const notesEl = $('#aiPanelNotes');
    if (notesEl) {
      if (!p.structuredNotes || !p.structuredNotes.length) {
        notesEl.innerHTML = `<div class="mono" style="color:var(--muted); font-size:13px; padding:8px 2px">No structured notes returned. The transcript may be too short or noisy.</div>`;
      } else {
        notesEl.innerHTML = p.structuredNotes.map(sec => `
          <div class="section-block">
            <div class="section-head">
              <span class="section-heading">${escapeHtml(sec.heading)}</span>
              ${sec.timestamp ? `<span class="ts-pill">${escapeHtml(sec.timestamp)}</span>` : ''}
            </div>
            <ul class="section-bullets">
              ${sec.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}
            </ul>
          </div>
        `).join('');
      }
    }

    // Summary
    const sumEl = $('#aiPanelSummary');
    if (sumEl) {
      const tldr = Array.isArray(p.summaryTLDR) ? p.summaryTLDR : [];
      const detailed = typeof p.summaryDetailed === 'string' ? p.summaryDetailed : '';
      sumEl.innerHTML = `
        <div class="section-block">
          <div class="section-heading" style="margin-bottom:8px">⚡ TL;DR — 30 sec read</div>
          ${tldr.length ? `<ul class="tldr-list">${tldr.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : `<div class="mono" style="color:var(--muted); font-size:13px">No TL;DR</div>`}
          <div style="margin-top:10px"><button type="button" class="secondary-btn mono" data-copy="tldr">Copy TL;DR</button></div>
        </div>
        <div class="section-block">
          <div class="section-heading" style="margin-bottom:8px">📖 Detailed Summary — covers every subtopic</div>
          <div class="detailed">${escapeHtml(detailed) || '<span style="color:var(--muted)">No detailed summary</span>'}</div>
          <div style="margin-top:10px"><button type="button" class="secondary-btn mono" data-copy="detailed">Copy detailed</button></div>
        </div>
      `;
      sumEl.querySelectorAll('[data-copy="tldr"]').forEach(b => b.addEventListener('click', () => {
        const txt = (p.summaryTLDR || []).map(s => `• ${s}`).join('\n');
        window.copyText && window.copyText(txt);
      }));
      sumEl.querySelectorAll('[data-copy="detailed"]').forEach(b => b.addEventListener('click', () => {
        window.copyText && window.copyText(p.summaryDetailed || '');
      }));
    }

    // Glossary
    const gloEl = $('#aiPanelGlossary');
    if (gloEl) {
      if (!p.glossary || !p.glossary.length) {
        gloEl.innerHTML = `<div class="mono" style="color:var(--muted); font-size:13px; padding:8px 2px">No glossary terms extracted.</div>`;
      } else {
        gloEl.innerHTML = `
          <table class="glossary">
            <thead><tr><th>Term</th><th>Definition</th></tr></thead>
            <tbody>
              ${p.glossary.map(g => `<tr><td>${escapeHtml(g.term)}</td><td>${escapeHtml(g.definition)}</td></tr>`).join('')}
            </tbody>
          </table>
          <div style="margin-top:10px"><button type="button" class="secondary-btn mono" id="copyGlossaryBtn">Copy glossary</button></div>
        `;
        const cg = gloEl.querySelector('#copyGlossaryBtn');
        if (cg) cg.addEventListener('click', () => {
          const txt = p.glossary.map(g => `${g.term}: ${g.definition}`).join('\n');
          window.copyText && window.copyText(txt);
        });
      }
    }

    // Quiz
    const quizEl = $('#aiPanelQuiz');
    if (quizEl) {
      if (!p.quiz || !p.quiz.length) {
        quizEl.innerHTML = `<div class="mono" style="color:var(--muted); font-size:13px; padding:8px 2px">No quiz generated.</div>`;
      } else {
        quizEl.innerHTML = p.quiz.map(q => `
          <div class="quiz-q" data-qid="${q.id}">
            <div class="quiz-q-head"><span class="quiz-n">Q${q.id}</span><span class="quiz-text">${escapeHtml(q.q)}</span></div>
            <div class="quiz-opts">
              ${q.options.map((opt, i) => `
                <button type="button" class="quiz-opt" data-opt="${i}" data-letter="${String.fromCharCode(65+i)}">
                  <span class="opt-letter">${String.fromCharCode(65+i)}</span>
                  <span>${escapeHtml(opt)}</span>
                </button>
              `).join('')}
            </div>
            <div class="quiz-explain" hidden></div>
          </div>
        `).join('') + `<div class="mono" style="color:var(--muted); font-size:12px; margin-top:8px">Tap an option to reveal the answer. Explanations are grounded in the lecture.</div>`;

        // attach handlers
        quizEl.querySelectorAll('.quiz-q').forEach(card => {
          const qid = parseInt(card.dataset.qid, 10);
          const qObj = p.quiz.find(x => x.id === qid);
          if (!qObj) return;
          const explainEl = card.querySelector('.quiz-explain');
          card.querySelectorAll('.quiz-opt').forEach(btn => {
            btn.addEventListener('click', () => {
              const picked = parseInt(btn.dataset.opt, 10);
              const correct = qObj.answerIndex;
              // lock this question
              card.querySelectorAll('.quiz-opt').forEach(b => b.style.pointerEvents = 'none');
              card.querySelectorAll('.quiz-opt').forEach(b => {
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

    // Reset chat when new pack arrives? keep history but add hint
    if (chatLog && !chatLog.dataset.welcomed) {
      chatLog.dataset.welcomed = '1';
      appendChat('assistant', 'Study pack generated! Ask me anything from this lecture — I answer only from the transcript. Try: “Explain section 2 for 5 marks.”');
    }
  }

  function buildMarkdown(p) {
    const last = window.__transcriptState?.last;
    const url = last?.url || '';
    const lines = [];
    lines.push(`# ${p.title || last?.title || 'Study Pack'}`);
    if (url) lines.push(`> Source: ${url}`);
    lines.push('');
    lines.push(`## TL;DR`);
    (p.summaryTLDR || []).forEach(b => lines.push(`- ${b}`));
    lines.push('');
    lines.push(`## Detailed Summary`);
    lines.push(p.summaryDetailed || '_No summary_');
    lines.push('');
    lines.push(`## Structured Notes`);
    (p.structuredNotes || []).forEach(sec => {
      lines.push(`### ${sec.heading}${sec.timestamp ? ` — ${sec.timestamp}` : ''}`);
      sec.bullets.forEach(b => lines.push(`- ${b}`));
      lines.push('');
    });
    lines.push(`## Glossary`);
    lines.push(`| Term | Definition |`);
    lines.push(`|---|---|`);
    (p.glossary || []).forEach(g => lines.push(`| ${g.term.replace(/\|/g,'/')} | ${g.definition.replace(/\|/g,'/')} |`));
    lines.push('');
    lines.push(`## Quiz (MCQs)`);
    (p.quiz || []).forEach(q => {
      lines.push(`**Q${q.id}. ${q.q}**`);
      q.options.forEach((o, i) => lines.push(`- ${String.fromCharCode(65+i)}. ${o}`));
      lines.push(`> Answer: ${q.answerLetter} — ${q.explanation}`);
      lines.push('');
    });
    lines.push(`---\n*Generated by TranscriptGen AI — grounded in the lecture transcript.*`);
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

  async function sendChat(e) {
    if (e) e.preventDefault();
    const q = chatInput ? chatInput.value.trim() : '';
    if (!q) return;
    const last = window.__transcriptState?.last;
    if (!last || !last.text) {
      appendChat('assistant', 'Extract a transcript first, then ask questions.');
      return;
    }
    const question = q;
    if (chatInput) chatInput.value = '';
    appendChat('user', question);
    if (chatSend) { chatSend.disabled = true; chatSend.textContent = '…'; }
    chatHistory.push({ role: 'user', text: question });
    try {
      const r = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: last.text,
          title: last.title,
          question,
          history: chatHistory.slice(0, -1),
          videoId: last.videoId,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Chat failed (${r.status})`);
      const ans = j.answer || '(empty response)';
      chatHistory.push({ role: 'assistant', text: ans });
      appendChat('assistant', ans);
    } catch (err) {
      const msg = err.message || 'Chat failed.';
      appendChat('assistant', `Error: ${msg}`);
    } finally {
      if (chatSend) { chatSend.disabled = false; chatSend.textContent = 'Send'; }
    }
  }

  // Tabs
  document.querySelectorAll('[data-ai-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-ai-tab]').forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
      const tab = btn.dataset.aiTab;
      document.querySelectorAll('.ai-panel').forEach(p => {
        p.hidden = p.dataset.panel !== tab;
      });
    });
  });

  if (generateBtn) generateBtn.addEventListener('click', generate);
  if (chatForm) chatForm.addEventListener('submit', sendChat);
  if (copyStudyPackBtn) copyStudyPackBtn.addEventListener('click', () => {
    if (!pack) return;
    window.copyText && window.copyText(buildMarkdown(pack));
  });
  if (downloadMdBtn) downloadMdBtn.addEventListener('click', () => {
    if (!pack) return;
    const last = window.__transcriptState?.last;
    const safe = (pack.title || last?.title || 'study-pack').replace(/[\\/:*?"<>|]+/g,' ').slice(0,80).trim() || 'study-pack';
    const md = buildMarkdown(pack);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${safe} — Study Pack.md`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    window.toast && window.toast('Study Pack downloaded ✓');
  });
})();
