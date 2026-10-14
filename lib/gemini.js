/**
 * Gemini integration for TranscriptGen — NPTEL study companion.
 * Exports: generateStudyPack(text, meta), chatWithLecture(text, question, history)
 * Uses strict JSON output + repair retry. In-memory LRU cache.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');

const CACHE = new Map(); // key -> { data, exp }
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE = 80;

function cacheGet(key) {
  const v = CACHE.get(key);
  if (!v) return null;
  if (Date.now() > v.exp) { CACHE.delete(key); return null; }
  return v.data;
}
function cacheSet(key, data) {
  if (CACHE.size >= MAX_CACHE) {
    const oldest = CACHE.keys().next().value;
    CACHE.delete(oldest);
  }
  CACHE.set(key, { data, exp: Date.now() + CACHE_TTL_MS });
}

function getModel(modelName) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const e = new Error('GEMINI_API_KEY is not set on the server. Add it to your environment / Vercel dashboard.');
    e.status = 503;
    throw e;
  }
  const genAI = new GoogleGenerativeAI(key);
  const name = modelName || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  return genAI.getGenerativeModel({
    model: name,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  });
}

function getChatModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const e = new Error('GEMINI_API_KEY is not set on the server.');
    e.status = 503;
    throw e;
  }
  const genAI = new GoogleGenerativeAI(key);
  const name = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  return genAI.getGenerativeModel({
    model: name,
    generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
  });
}

function clip(text, limit = 120000) {
  if (!text) return '';
  if (text.length <= limit) return text;
  // Keep start + end, cut middle — preserves intro + conclusion for NPTEL
  const half = Math.floor(limit / 2);
  return text.slice(0, half) + '\n\n[... middle truncated for length ...]\n\n' + text.slice(-half);
}

function parseJsonStrict(raw) {
  let s = String(raw || '').trim();
  // Gemini with responseMimeType=json should be clean, but be defensive
  // Strip markdown fences if any
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // Extract outermost JSON object
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1) s = s.slice(first, last + 1);
  return JSON.parse(s);
}

function normalizePack(raw, title) {
  const p = raw && typeof raw === 'object' ? raw : {};

  // TL;DR: array of strings, 5-7
  let summaryTLDR = Array.isArray(p.summaryTLDR) ? p.summaryTLDR
    : Array.isArray(p.tldr) ? p.tldr
    : typeof p.summary === 'string' ? p.summary.split(/\n/).filter(Boolean).slice(0, 7)
    : [];
  summaryTLDR = summaryTLDR.map(s => String(s).replace(/^[-•\s]+/, '').trim()).filter(Boolean).slice(0, 10);

  // Detailed summary: string (paragraphs / markdown allowed)
  let summaryDetailed = typeof p.summaryDetailed === 'string' ? p.summaryDetailed
    : typeof p.detailedSummary === 'string' ? p.detailedSummary
    : typeof p.summary === 'string' ? p.summary : '';

  // Structured notes: [{ heading, bullets[], timestampMMSS? }]
  let structuredNotes = Array.isArray(p.structuredNotes) ? p.structuredNotes
    : Array.isArray(p.sections) ? p.sections
    : Array.isArray(p.notes) ? p.notes : [];
  structuredNotes = structuredNotes.slice(0, 18).map(s => {
    const heading = String(s.heading || s.title || s.topic || 'Untitled').trim().slice(0, 140);
    const bullets = Array.isArray(s.bullets) ? s.bullets
      : Array.isArray(s.points) ? s.points
      : typeof s.content === 'string' ? [s.content] : [];
    return {
      heading,
      bullets: bullets.map(b => String(b).trim()).filter(Boolean).slice(0, 10),
      timestamp: typeof s.timestamp === 'string' ? s.timestamp.trim().slice(0, 8) : null,
    };
  }).filter(s => s.bullets.length);

  // Glossary: [{ term, definition }]
  let glossary = Array.isArray(p.glossary) ? p.glossary
    : Array.isArray(p.keyTerms) ? p.keyTerms
    : Array.isArray(p.terms) ? p.terms : [];
  glossary = glossary.slice(0, 30).map(g => ({
    term: String(g.term || g.word || '').trim().slice(0, 120),
    definition: String(g.definition || g.meaning || g.desc || '').trim().slice(0, 600),
  })).filter(g => g.term && g.definition);

  // Quiz: [{ q, options[4], answer, explanation }]
  let quiz = Array.isArray(p.quiz) ? p.quiz
    : Array.isArray(p.mcqs) ? p.mcqs : [];
  quiz = quiz.slice(0, 15).map((q, i) => {
    const text = String(q.q || q.question || '').trim();
    const opts = Array.isArray(q.options) ? q.options.map(o => String(o).trim()).filter(Boolean).slice(0, 4)
      : Array.isArray(q.choices) ? q.choices.map(o => String(o).trim()).slice(0, 4) : [];
    const ansRaw = String(q.answer || '').trim();
    // normalize answer to 0..3 or letter
    let answerIndex = -1;
    if (/^[A-D]$/i.test(ansRaw)) answerIndex = ansRaw.toUpperCase().charCodeAt(0) - 65;
    else if (/^[0-3]$/.test(ansRaw)) answerIndex = parseInt(ansRaw, 10);
    else {
      // try to match option text
      const idx = opts.findIndex(o => o.toLowerCase() === ansRaw.toLowerCase());
      if (idx !== -1) answerIndex = idx;
    }
    if (answerIndex < 0 || answerIndex > 3) answerIndex = 0;
    // Pad to 4 if model returned fewer
    while (opts.length < 4) opts.push(`Option ${opts.length + 1}`);
    return {
      id: i + 1,
      q: text.slice(0, 600),
      options: opts,
      answerIndex,
      answerLetter: String.fromCharCode(65 + answerIndex),
      explanation: String(q.explanation || q.explain || '').trim().slice(0, 600),
    };
  }).filter(q => q.q && q.options.length === 4);

  // Title passthrough
  const outTitle = typeof p.title === 'string' && p.title.trim() ? p.title.trim() : (title || '');

  return {
    title: outTitle,
    summaryTLDR,
    summaryDetailed,
    structuredNotes,
    glossary,
    quiz,
  };
}

const STUDY_PACK_SYSTEM = `You are an NPTEL exam tutor. You turn raw lecture transcripts into exam-ready study material for engineering students who skip watching the full video. You MUST preserve full topic coverage — do not omit subtopics. No hallucination: only use facts present in or directly inferable from the transcript. If the transcript is noisy or has filler, clean it but keep technical accuracy.

Output language: English. Keep it concise, scannable, and "prepare-friendly". Use short bullets. Where you can infer a rough position in the lecture, add a timestamp like "02:15" (mm:ss) for that section.

You will be given:
- Lecture title
- Full transcript text (may be long) and optionally timestamped segments

Return STRICT JSON (no markdown fences) with this exact shape:
{
  "title": "lecture title (same as input)",
  "summaryTLDR": ["5-7 ultra-short bullets, 30-sec read, covers the whole lecture"],
  "summaryDetailed": "exam-length detailed summary in 2-4 short paragraphs plus a few bullets; covers every subtopic so a student can revise without rewatching",
  "structuredNotes": [
    { "heading": "Section title (e.g., '1. What is X — definition & motivation')", "bullets": ["3-6 concise bullets per section"], "timestamp": "mm:ss or null if unknown" }
  ],
  "glossary": [
    { "term": "Term", "definition": "One-line definition / formula if applicable (e.g., 'F = ma')" }
  ],
  "quiz": [
    { "q": "MCQ question text", "options": ["A text","B text","C text","D text"], "answer": "A", "explanation": "One-line why that option is correct" }
  ]
}

Rules:
- structuredNotes: 6-12 sections, logical lecture flow (Overview → Topic breakdown → Key Concepts → Formulas/Examples → Conclusion). Each section 3-6 bullets.
- glossary: 8-15 entries, only terms actually in the lecture.
- quiz: 10-12 MCQs, 4 options each, exactly one correct answer (letter A-D), explanations grounded in the transcript. Distractors plausible. Cover different subtopics.
- Never invent facts not in transcript. If transcript is empty/garbage, return empty arrays (don't fabricate).
- Keep all strings plain text (no HTML). Definitions may contain simple math.
`;

function buildStudyPackPrompt(title, text, segments) {
  const clipped = clip(text, 110000);
  const segs = Array.isArray(segments) && segments.length
    ? segments.slice(0, 280).map(s => {
        const ms = Number(s.offset ?? 0);
        const sec = Math.floor(ms / 1000);
        const m = String(Math.floor(sec / 60)).padStart(2, '0');
        const sc = String(sec % 60).padStart(2, '0');
        return `[${m}:${sc}] ${String(s.text || '').trim()}`;
      }).join('\n').slice(0, 30000)
    : '';
  return `Lecture Title: ${title || '(unknown)'}

Full transcript:
${clipped}

${segs ? `Timestamped segments (for timestamp grounding):\n${segs}\n` : ''}

Return the JSON now.`;
}

async function generateStudyPack({ title, text, segments, videoId }) {
  if (!text || !text.trim()) {
    const e = new Error('Transcript text is empty — nothing to summarize.');
    e.status = 400;
    throw e;
  }

  const cacheKey = `pack:${videoId || 'no-id'}:${hashStr(text).slice(0, 16)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { ...cached, cached: true };

  const prompt = buildStudyPackPrompt(title, text, segments);
  let model = null;
  let lastErr = null;

  for (const modelName of [process.env.GEMINI_MODEL || 'gemini-3.8-flash', 'gemini-2.0-flash']) {
    try {
      model = getModel(modelName);
      const result = await model.generateContent([
        { text: STUDY_PACK_SYSTEM },
        { text: prompt },
      ]);
      const rawText = result.response.text();
      let parsed = parseJsonStrict(rawText);
      let normalized = normalizePack(parsed, title);

      // If parsing gave empty everything, try one repair retry
      const empty = !normalized.summaryTLDR.length && !normalized.structuredNotes.length && !normalized.glossary.length && !normalized.quiz.length;
      if (empty && rawText && rawText.length > 40) {
        const retry = await model.generateContent([
          { text: 'Your previous response was empty. Fix it. Return VALID JSON only in the exact schema, grounded in the transcript. If transcript was empty, return empty arrays.' },
          { text: prompt.slice(0, 60000) },
        ]);
        const t2 = retry.response.text();
        parsed = parseJsonStrict(t2);
        normalized = normalizePack(parsed, title);
      }

      const out = { ...normalized, model: modelName };
      cacheSet(cacheKey, out);
      return out;
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || '');
      // Don't retry on quota/auth
      if (/API_KEY|permission|not found|quota/i.test(msg) && modelName === 'gemini-3.8-flash') {
        // try fallback model once
        continue;
      }
      if (/quota|429|rate/i.test(msg)) throw e;
      // try fallback model
      if (modelName === 'gemini-3.8-flash') continue;
      throw e;
    }
  }
  throw lastErr || new Error('Gemini request failed.');
}

const CHAT_SYSTEM = `You are an NPTEL exam tutor answering ONLY from the lecture transcript provided. Rules:
- Ground every answer in the transcript. If the question is outside the lecture, say "This wasn't covered in this lecture" and suggest the closest related topic from it if any.
- Be concise, exam-ready, and use bullets where helpful.
- When relevant, cite a rough timestamp like [12:34].
- Never hallucinate formulas, definitions, or facts not in the transcript.
- Reply in English, plain text (simple markdown bullets ok, no HTML).
`;

async function chatWithLecture({ text, question, history, title }) {
  if (!text || !text.trim()) {
    const e = new Error('Transcript text is required for chat.');
    e.status = 400;
    throw e;
  }
  if (!question || !String(question).trim()) {
    const e = new Error('Question is required.');
    e.status = 400;
    throw e;
  }

  const model = getChatModel();
  const clipped = clip(text, 90000);

  const hist = Array.isArray(history) ? history.slice(-8).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: String(m.text || '').slice(0, 3000) }],
  })) : [];

  // Build a chat session with system + transcript grounding
  const preamble = `${CHAT_SYSTEM}\n\nLecture Title: ${title || '(unknown)'}\n\nTranscript:\n${clipped}`;
  const chat = model.startChat({
    history: [
      { role: 'user', parts: [{ text: preamble }] },
      { role: 'model', parts: [{ text: 'Understood. I will answer only from this lecture transcript.' }] },
      ...hist,
    ],
  });

  const q = String(question).trim().slice(0, 4000);
  const result = await chat.sendMessage(q);
  const answer = result.response.text().trim();
  return { answer, model: process.env.GEMINI_MODEL || 'gemini-3.8-flash' };
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return Math.abs(h).toString(36) + '-' + s.length.toString(36);
}

function mapGeminiError(err) {
  const msg = String(err.message || 'AI request failed.');
  const low = msg.toLowerCase();
  if (low.includes('gemini_api_key') || low.includes('api_key') || low.includes('not set')) {
    return { status: 503, error: 'AI is not configured on this server. Set GEMINI_API_KEY in environment.' };
  }
  if (low.includes('api key') || low.includes('permission') || low.includes('api_key_invalid')) {
    return { status: 502, error: 'AI service authentication failed. Check GEMINI_API_KEY.' };
  }
  if (low.includes('quota') || low.includes('429') || low.includes('rate')) {
    return { status: 429, error: 'AI is rate-limited right now. Please retry in ~30 seconds.' };
  }
  if (low.includes('not found') || low.includes('model')) {
    return { status: 502, error: 'AI model is unavailable. Try again or contact support.' };
  }
  if (err.status && Number.isInteger(err.status)) {
    return { status: err.status, error: msg.slice(0, 500) };
  }
  return { status: 500, error: msg.slice(0, 500) };
}

module.exports = { generateStudyPack, chatWithLecture, mapGeminiError, clip };
