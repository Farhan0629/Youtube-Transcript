// Load .env locally — on Vercel/Render env is injected, ignore missing file
try { require('dotenv').config(); } catch (_) {}

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url} (original: ${req.originalUrl})`);
  next();
});

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

// ---- Robust transcript fetcher: library + multi-client Innertube + HTML scrape ----
async function fetchViaHtmlScrape(videoId, wantedLang, YT) {
  // Fetch watch page HTML and extract captionTracks baseUrls via regex
  // This is independent of Innertube and works when player API is IP-limited
  const uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  ];
  for (const ua of uas) {
    try {
      const r = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
        headers: {
          'User-Agent': ua,
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const html = await r.text();
      if (!html || html.length < 1000) continue;
      // Extract all timedtext baseUrls — look for the JSON-escaped form + direct form
      const re = /https:\/\/www\.youtube\.com\/api\/timedtext\?[^"'\s\\]+/g;
      const matches = html.match(re);
      if (!matches || !matches.length) continue;
      // Unescape and dedupe; prefer current wantedLang
      const urls = [...new Set(matches.map(u => u.replace(/\\u0026/g, '&').replace(/\\/g, '')))];
      let best = urls.find(u => u.includes(`lang=${wantedLang}`)) || urls.find(u => u.includes('lang=en')) || urls[0];
      // Ensure format param; server's parse handles both srv3 + classic
      if (best && !best.includes('fmt=')) best += '&fmt=srv3';
      // The HTML URLs are often without signature — need to use them as-is; if they 403, skip
      for (const cand of [best, ...urls].slice(0, 3)) {
        try {
          const tr = await fetch(cand, {
            headers: { 'User-Agent': ua, 'Accept-Language': 'en-US,en;q=0.9' },
            signal: AbortSignal.timeout(8000),
          });
          if (!tr.ok) continue;
          const xml = await tr.text();
          if (!xml || xml.length < 30 || xml.includes('Your bot is costing')) continue;
          // Try both srv3 and classic parsers
          let parsed = [];
          try { parsed = YT.parseTranscriptXml(xml, wantedLang); } catch (_) { parsed = []; }
          if (parsed && parsed.length) return parsed;
          // Fallback: classic regex extract
          const classicRe = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
          const classic = [...xml.matchAll(classicRe)].map(m => ({
            text: m[3].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"),
            duration: parseFloat(m[2]),
            offset: parseFloat(m[1]) * 1000,
            lang: wantedLang,
          }));
          if (classic.length) return classic;
        } catch (_) { continue; }
      }
    } catch (_) { continue; }
  }
  return null;
}

async function fetchViaInnertube(videoId, wantedLang, YT) {
  const clients = [
    { name: 'ANDROID', version: '20.10.38', ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)' },
    { name: 'IOS', version: '20.42.6', ua: 'com.google.ios.youtube/20.42.6 (iPhone14,3; U; CPU iOS 18_0 like Mac OS X)' },
    { name: 'ANDROID', version: '19.09.37', ua: 'com.google.android.youtube/19.09.37 (Linux; U; Android 13)' },
    { name: 'WEB', version: '2.20240726.01.00', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
  ];
  for (const c of clients) {
    try {
      const clientObj = { clientName: c.name, clientVersion: c.version };
      if (c.bodyExtra) Object.assign(clientObj, c.bodyExtra);
      const body = {
        context: { client: clientObj },
        videoId, contentCheckOk: true, racyCheckOk: true,
      };
      const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(7000),
      });
      console.log(`[INNERTUBE] ${c.name} player status: ${r.status}`);
      if (!r.ok) continue;
      const data = await r.json();
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      console.log(`[INNERTUBE] ${c.name} tracks: ${tracks?.length || 0}`);
      if (!Array.isArray(tracks) || !tracks.length) continue;
      // Prefer requested lang, otherwise en, otherwise first track (handles auto-generated)
      const track = tracks.find(t => t.languageCode === wantedLang) || tracks.find(t => t.languageCode === 'en') || tracks[0];
      if (!track?.baseUrl) continue;
      // baseUrl already carries signature/expire; fetch as-is
      const tr = await fetch(track.baseUrl, {
        headers: { 'User-Agent': c.ua, 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(7000),
      });
      console.log(`[INNERTUBE] ${c.name} timedtext status: ${tr.status}`);
      if (!tr.ok) continue;
      const xml = await tr.text();
      console.log(`[INNERTUBE] ${c.name} timedtext xml length: ${xml?.length || 0}`);
      if (!xml || xml.length < 20) continue;
      const parsed = YT.parseTranscriptXml(xml, track.languageCode || wantedLang);
      console.log(`[INNERTUBE] ${c.name} parsed items: ${parsed?.length || 0}`);
      if (parsed && parsed.length) return parsed;
    } catch (e) { 
      console.error(`[INNERTUBE_ERR] ${c.name}: ${e.message}`);
      continue; 
    }
  }
  return null;
}

async function fetchTranscriptRobust(videoId, wantedLang, YT) {
  let lastErr = null;

  // 1) multi-client Innertube FIRST — hits YouTube's mobile player API directly (no web recaptcha blocking)
  try {
    const viaInnertube = await fetchViaInnertube(videoId, wantedLang, YT);
    if (viaInnertube && viaInnertube.length) return viaInnertube;
  } catch (e) {
    lastErr = e;
    console.error('[ROBUST] Innertube error:', e.message);
  }

  // 2) library with requested lang — reliable locally or when Innertube is bypassed
  try {
    return await YT.fetchTranscript(videoId, { lang: wantedLang });
  } catch (e) {
    lastErr = e;
    const m = String(e?.message || '');
    if (m.includes('Available languages') || m.toLowerCase().includes('not available')) {
      try { return await YT.fetchTranscript(videoId); } catch (e2) { lastErr = e2; }
      if (wantedLang !== 'en') {
        try { return await YT.fetchTranscript(videoId, { lang: 'en' }); } catch (e3) { lastErr = e3; }
      }
    }
  }

  // 3) HTML scrape — extracts timedtext URLs embedded in watch page
  try {
    const viaHtml = await fetchViaHtmlScrape(videoId, wantedLang, YT);
    if (viaHtml && viaHtml.length) return viaHtml;
  } catch (e) {
    lastErr = e;
  }

  // 4) library fallback without lang
  try { return await YT.fetchTranscript(videoId); } catch (e) { lastErr = e; }
  try { return await YT.fetchTranscript(videoId, { lang: 'en' }); } catch (e) { lastErr = e; }

  throw lastErr || new Error('Failed to fetch transcript after all fallbacks');
}

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
    const transcriptPromise = fetchTranscriptRobust(videoId, wantedLang, YT);

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
    console.error('[TRANSCRIPT_CATCH]', err?.message, err?.stack);
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
      const raw = await fetchTranscriptRobust(vid, 'en', YT);
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
      const raw = await fetchTranscriptRobust(String(videoId), 'en', YT);
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
