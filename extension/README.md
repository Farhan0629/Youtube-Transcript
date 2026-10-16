# TranscriptGen — Chrome Extension

A companion Chrome Extension for **TranscriptGen** that lets you extract transcripts and generate AI study packs directly while browsing YouTube.

---

## Features

- **One-Click YouTube Extraction** — Automatically detects the active video URL and pulls the full transcript.
- **AI Study Pack Generation** — Converts lecture transcripts into structured study notes, summaries, glossary tables, practice quizzes, and an interactive chat assistant.
- **Draggable Floating Window** — Pop the interface out into its own native window with the **🗗 Detach** button to place it side-by-side with your video.
- **Zoom Controls** — Adjust text sizing from 75% to 160% using the `＋` / `－` header buttons or `Ctrl` + mouse wheel.
- **Direct Clipboard & Export** — Copy raw transcripts, timestamped transcripts, or download Markdown study packs.
- **Zero-Config Local Backend** — Pre-configured to work with `http://localhost:3000` out of the box.

---

## Installation

1. Start your local server:
   ```bash
   npm start
   ```
2. Open Google Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the upper-right corner.
4. Click **Load unpacked** and select this directory (`extension/`).
5. Pin **TranscriptGen** to your browser toolbar.

---

## Configuration

Click the **⚙︎ Settings** icon inside the extension popup to configure:

- **API Base URL** — Defaults to `http://localhost:3000`. Update this to your deployed cloud URL (e.g., `https://your-app.vercel.app`) when running remotely.
- **Personal Gemini API Key (Optional)** — Bring your own Google AI Studio key (`AIza...`) to bypass shared server quotas.
- **Model Override (Optional)** — Specify a custom Gemini model variant (e.g., `gemini-2.0-flash`).

---

## File Structure

- `manifest.json` — Manifest V3 configuration.
- `popup.html` / `popup.css` / `popup.js` — Extension user interface and controller.
- `background.js` — Service worker for lifecycle management and CORS proxying.
- `options.html` / `options.js` — Extension preferences and connectivity tester.
- `icons/` — Extension icons (16px, 48px, 128px).
