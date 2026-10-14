const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---- Helpers ----
const YT_ID_RE = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;

function extractVideoId(url) {
  if (!url || typeof url !== 'string') return null;
  const t = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(t)) return t;
  const m = t.match(YT_ID_RE);
  if (m) return m[1];
  try {
    const u = new URL(t);
    const v = u.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    const parts = u.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /^[a-zA-Z0-9_-]{11}$/.test(last)) return last;
  } catch (_) {}
  return null;
}

async function fetchTitle(videoId, originalUrl) {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const r = await fetch(oembedUrl, { headers: { 'User-Agent': 'TranscriptGen/1.0' }, signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const j = await r.json();
      if (j.title) return j.title;
    }
  } catch (_) {}
  try {
    const r2 = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(originalUrl || `https://www.youtube.com/watch?v=${videoId}`)}`, { signal: AbortSignal.timeout(5000) });
    if (r2.ok) {
      const j2 = await r2.json();
      if (j2.title) return j2.title;
    }
  } catch (_) {}
  try {
    const r3 = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)' },
      body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } }, videoId }),
      signal: AbortSignal.timeout(6000),
    });
    if (r3.ok) {
      const d = await r3.json();
      const t = d?.videoDetails?.title;
      if (t) return t;
    }
  } catch (_) {}
  return null;
}

function formatTime(ms) {
  const sec = Math.floor(Number(ms) / 1000 || 0);
  const m = Math.floor(sec / 60);
  const sc = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`;
}

// ---- Simple rate limiter for /api/ai/* ----
const aiHits = new Map(); // ip -> { count, resetAt }
function aiRateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  const now = Date.now();
  const entry = aiHits.get(ip);
  if (!entry || now > entry.resetAt) {
    aiHits.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 12) {
    return res.status(429).json({ error: 'Too many AI requests. Please wait a minute and retry.' });
  }
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of aiHits) if (now > v.resetAt) aiHits.delete(k);
}, 60_000).unref?.();

// ---- API: transcript (unchanged core) ----
app.post('/api/transcript', async (req, res) => {
  const t0 = Date.now();
  const { url, lang } = req.body || {};
  if (!url) return res.status(400).json({ error: 'YouTube URL is required.' });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL. Please paste a valid youtube.com or youtu.be link.' });

  const wantedLang = (lang || 'en').trim().toLowerCase();
  let YT;
  try {
    YT = require('youtube-transcript').YoutubeTranscript;
    if (!YT) throw new Error('no CJS export');
  } catch (_) {
    const mod = await import('youtube-transcript');
    YT = mod.YoutubeTranscript;
  }

  try {
    const titlePromise = fetchTitle(videoId, url);
    const transcriptPromise = (async () => {
      try {
        return await YT.fetchTranscript(videoId, { lang: wantedLang });
      } catch (e) {
        const msg = String(e?.message || '');
        if (msg.includes('Available languages') || msg.toLowerCase().includes('not available')) {
          return await YT.fetchTranscript(videoId);
        }
        throw e;
      }
    })();

    const [title, raw] = await Promise.all([titlePromise, transcriptPromise]);
    if (!raw || !raw.length) return res.status(404).json({ error: 'No transcript found for this video.' });

    const segments = raw.map(s => ({
      text: (s.text || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim(),
      offset: Number(s.offset ?? s.start ?? 0),
      duration: Number(s.duration ?? s.dur ?? 0),
    }));

    const fullText = segments.map(s => s.text).join(' ');
    const timestamped = segments.map(s => `[${formatTime(s.offset)}] ${s.text}`).join('\n');
    const elapsed = Date.now() - t0;

    res.json({
      videoId,
      title: title || `YouTube Video — ${videoId}`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      language: wantedLang,
      segmentCount: segments.length,
      charCount: fullText.length,
      wordCount: fullText.split(/\s+/).filter(Boolean).length,
      durationApprox: segments.length ? formatTime(segments[segments.length - 1].offset + segments[segments.length - 1].duration) : null,
      text: fullText,
      timestamped,
      segments,
      elapsedMs: elapsed,
    });
  } catch (err) {
    const msg = err?.message || 'Failed to fetch transcript.';
    let status = 500;
    let friendly = msg.replace(/^\[YoutubeTranscript\]\s*🚨\s*/, '');
    if (/disabled/i.test(msg)) { status = 404; friendly = 'Transcripts are disabled for this video.'; }
    else if (/no transcripts/i.test(msg)) { status = 404; friendly = 'No transcripts are available for this video.'; }
    else if (/not available/i.test(msg)) { status = 404; friendly = 'No English transcript available for this video.'; }
    else if (/video.*unavailable|no longer available/i.test(msg)) { status = 404; friendly = 'This video is unavailable or private.'; }
    else if (/too many requests|captcha/i.test(msg)) { status = 429; friendly = 'YouTube is rate-limiting requests. Please try again in a minute.'; }
    friendly = friendly.slice(0, 400);
    res.status(status).json({ error: friendly });
  }
});

// ---- API: AI study-pack + chat ----
let geminiMod = null;
function getGemini() {
  if (!geminiMod) geminiMod = require('./lib/gemini');
  return geminiMod;
}

app.post('/api/ai/study-pack', aiRateLimit, async (req, res) => {
  const { url, videoId: vidRaw, text, title, segments } = req.body || {};
  let vid = (vidRaw || (url ? extractVideoId(url) : null) || '').trim();
  let finalText = typeof text === 'string' ? text : '';
  let finalTitle = typeof title === 'string' ? title : '';
  let finalSegments = Array.isArray(segments) ? segments : null;

  // If only url/videoId given without text, fetch transcript server-side for convenience
  if (!finalText && vid) {
    let YT;
    try {
      YT = require('youtube-transcript').YoutubeTranscript;
      if (!YT) throw new Error('no CJS');
    } catch (_) {
      const m = await import('youtube-transcript');
      YT = m.YoutubeTranscript;
    }
    try {
      if (!finalTitle) finalTitle = (await fetchTitle(vid, url)) || finalTitle;
      const raw = await YT.fetchTranscript(vid, { lang: 'en' }).catch(() => YT.fetchTranscript(vid));
      const segs = raw.map(s => ({
        text: (s.text || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim(),
        offset: Number(s.offset ?? 0),
        duration: Number(s.duration ?? 0),
      }));
      finalText = segs.map(s => s.text).join(' ');
      finalSegments = segs;
    } catch (e) {
      return res.status(404).json({ error: 'Could not fetch transcript for this video. Check the link and try again.' });
    }
  }

  if (!finalText || !finalText.trim()) return res.status(400).json({ error: 'Transcript text is required. Paste a YouTube link or provide text.' });

  try {
    const { generateStudyPack, mapGeminiError } = getGemini();
    const pack = await generateStudyPack({ title: finalTitle, text: finalText, segments: finalSegments, videoId: vid });
    res.json({ videoId: vid || null, ...pack });
  } catch (err) {
    const mapped = getGemini().mapGeminiError(err);
    res.status(mapped.status).json({ error: mapped.error });
  }
});

app.post('/api/ai/chat', aiRateLimit, async (req, res) => {
  const { text, question, history, title, videoId } = req.body || {};
  let finalText = typeof text === 'string' ? text : '';
  let finalTitle = typeof title === 'string' ? title : '';

  if (!finalText && videoId) {
    let YT;
    try {
      YT = require('youtube-transcript').YoutubeTranscript;
      if (!YT) throw new Error('no CJS');
    } catch (_) {
      const m = await import('youtube-transcript');
      YT = m.YoutubeTranscript;
    }
    try {
      const raw = await YT.fetchTranscript(String(videoId), { lang: 'en' }).catch(() => YT.fetchTranscript(String(videoId)));
      finalText = raw.map(s => (s.text || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()).join(' ');
      if (!finalTitle) finalTitle = (await fetchTitle(String(videoId))) || '';
    } catch (_) {
      return res.status(404).json({ error: 'Could not fetch transcript for this video.' });
    }
  }

  if (!finalText) return res.status(400).json({ error: 'Transcript text is required for chat.' });
  if (!question || !String(question).trim()) return res.status(400).json({ error: 'Question is required.' });

  try {
    const { chatWithLecture, mapGeminiError } = getGemini();
    const out = await chatWithLecture({ text: finalText, question: String(question), history: Array.isArray(history) ? history : [], title: finalTitle });
    res.json(out);
  } catch (err) {
    const mapped = getGemini().mapGeminiError(err);
    res.status(mapped.status).json({ error: mapped.error });
  }
});

app.get('/api/health', (_, res) => res.json({ ok: true, ai: !!process.env.GEMINI_API_KEY }));
app.get('/api/ai/health', (_, res) => res.json({ ok: true, ai: !!process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || 'gemini-3.8-flash' }));

// static + SPA fallback — AFTER all /api routes so they are not shadowed
app.use(express.static(path.join(__dirname, 'public')));
app.get('/{*any}', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

if (require.main === module) {
  app.listen(PORT, () => console.log(`TranscriptGen running at http://localhost:${PORT} — AI: ${process.env.GEMINI_API_KEY ? 'on' : 'off (set GEMINI_API_KEY)'}`));
}

module.exports = app;
