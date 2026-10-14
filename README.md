# TranscriptGen — YouTube Transcript + AI Study Companion

Paste any YouTube lecture link and get the transcript with the video title — then turn it into exam-ready material with AI. Built for **NPTEL exam prep**: structured notes, summaries, glossary, quiz and chat, all grounded in the transcript. Premium, lightweight, fast.

## Features

- **Transcript (fast)** — oEmbed + InnerTube title in parallel with captions, English-preferred with fallback, plain / timestamped / segment views.
- **AI Study Pack (on-demand, Gemini)** — one click generates:
  - **Structured notes** — topic-wise sections with timestamp pills
  - **TL;DR + Detailed summary** — 30-sec bullets + exam-length coverage
  - **Glossary** — terms, definitions & formulas
  - **Quiz** — 10–12 MCQs with answers & explanations
  - **Ask the Lecture** — chat grounded only in the transcript
- **Premium lightweight UI** — no heavy frameworks, dark/light, instant paint.

## Run locally

```bash
npm install
# optional: copy .env.example to .env and set GEMINI_API_KEY for AI features
npm start
# open http://localhost:3000
```

Requires Node 18+ (uses global `fetch`).

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | For AI features only | Google AI Studio key — [ai.google.dev](https://ai.google.dev). Omit and transcript extraction still works. |
| `GEMINI_MODEL` | No | Defaults to `gemini-3.8-flash`. Override if needed. |

Never commit `.env` — it is gitignored. See `.env.example`.

## API

- `POST /api/transcript` — body `{ "url": "https://www.youtube.com/watch?v=..." }` → `{ videoId, title, text, timestamped, segments, wordCount, ... }`
- `POST /api/ai/study-pack` — body `{ text, title, segments?, videoId? }` or `{ url }` or `{ videoId }` → `{ summaryTLDR, summaryDetailed, structuredNotes, glossary, quiz }`
- `POST /api/ai/chat` — body `{ text, question, history?, title?, videoId? }` → `{ answer }`
- `GET /api/health` → `{ ok, ai }`
- `GET /api/ai/health` → `{ ok, ai, model }`

AI endpoints require `GEMINI_API_KEY`. Rate-limited (12 req/min per IP). Responses are cached per transcript.

## Stack

- Backend: Express 5 + `youtube-transcript` (InnerTube + HTML fallback) + `@google/generative-ai`
- Frontend: vanilla HTML/CSS/JS, no build step

## Deploy — Vercel

1. Import this repo into Vercel (framework preset: Other).
2. Set environment variable `GEMINI_API_KEY` in Vercel → Settings → Environment Variables.
3. Deploy. `vercel.json` routes `/api/*` to the serverless function and serves `public/`.

Works on any Node host (Render, Railway, Fly.io) too — `npm start` with `PORT` env.

## GitHub

`https://github.com/Farhan0629/Youtube-Transcript`
