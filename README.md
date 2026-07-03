# Vidssaver Backend API

A small Express API that powers vidssaver.com. It fetches metadata and streams
downloads for TikTok, Instagram, and Facebook videos using **yt-dlp** (the
actively-maintained, open-source engine behind most reliable video downloaders)
and **ffmpeg** (for MP3 audio extraction).

---

## Why yt-dlp instead of a custom scraper

TikTok, Instagram, and Facebook change their internal APIs often. A downloader
built by hand-parsing their pages breaks within weeks and needs constant
rewrites. yt-dlp is maintained by a large open-source community that patches
these breakages continuously, which is what makes downloads reliable long-term.
This backend is a thin, safe wrapper around it — not a replacement for it.

**Being upfront:** no downloader tool, including the big commercial ones, can
promise it will *never* fail. A video can be private, deleted, age-restricted,
or a platform can roll out a change that yt-dlp hasn't patched yet. What this
backend guarantees is that it **never crashes or leaks server details** when
that happens — it always responds with a clean, human-readable error instead
(see `src/middleware/errorHandler.js`). Keeping yt-dlp updated (see below) is
the single biggest factor in keeping the success rate high.

---

## Requirements

- Node.js 18+
- **yt-dlp** installed on the server and available on `PATH`
  Install: https://github.com/yt-dlp/yt-dlp#installation
  Quick install (Linux/macOS): `pip install -U yt-dlp` or `brew install yt-dlp`
- **ffmpeg** installed on the server and available on `PATH` (required for MP3 audio downloads)
  Install: https://ffmpeg.org/download.html (or `apt install ffmpeg` / `brew install ffmpeg`)

> ⚠️ This backend needs a persistent server process with binaries installed.
> It will **not** run on serverless platforms with no shell access (e.g. Vercel
> serverless functions). Use a platform like **Render, Railway, Fly.io, a DigitalOcean
> droplet, or any VPS** where you control the runtime.

---

## Setup

```bash
npm install
cp .env.example .env
# edit .env — set ALLOWED_ORIGINS to your real frontend domain(s)
npm start
```

Server boots on `http://localhost:5000` by default.

Verify yt-dlp and ffmpeg are reachable from the same environment the app runs in:

```bash
yt-dlp --version
ffmpeg -version
```

If either command fails, the API will still start, but every request will
return a clean `503 Download engine is not available right now` instead of
crashing.

---

## Keeping it reliable (do this regularly)

Platforms change frequently, so **update yt-dlp often** — this is the #1 thing
that keeps success rates high:

```bash
pip install -U yt-dlp
# or, if installed as a standalone binary:
yt-dlp -U
```

Consider running that update on a weekly cron job on your server.

---

## API Reference

### `GET /api/health`
Health check.
```json
{ "ok": true, "status": "healthy", "time": "2026-07-03T12:00:00.000Z" }
```

### `POST /api/info`
Fetches metadata for a pasted link — call this first.

**Request**
```json
{ "url": "https://www.tiktok.com/@user/video/1234567890" }
```

**Response — success (200)**
```json
{
  "ok": true,
  "platform": "tiktok",
  "video": {
    "id": "1234567890",
    "title": "Weekend recap in 20 seconds",
    "thumbnail": "https://...",
    "durationSeconds": 24,
    "uploader": "username",
    "formats": {
      "hd": { "formatId": "137+140", "height": 1080, "ext": "mp4" },
      "sd": { "formatId": "135+140", "height": 480, "ext": "mp4" },
      "audio": { "formatId": "bestaudio", "ext": "mp3" }
    }
  }
}
```

**Response — error (400 / 422 / 502 / 504)**
```json
{ "ok": false, "error": "This video couldn't be fetched. It may be private, deleted, or region-locked." }
```

### `GET /api/download`
Streams the actual file. Point a browser `<a href>` or `window.location` at
this URL directly — it responds with `Content-Disposition: attachment` so the
browser downloads it natively.

**Query params**
| param      | required | notes                                                    |
|------------|----------|-----------------------------------------------------------|
| `url`      | yes      | the original video link                                   |
| `formatId` | no       | value from `formats.hd.formatId` or `formats.sd.formatId` |
| `audio`    | no       | `true` to extract MP3 audio instead of video               |

**Example**
```
GET /api/download?url=https%3A%2F%2Fwww.tiktok.com%2F%40user%2Fvideo%2F1234567890&formatId=137%2B140
GET /api/download?url=https%3A%2F%2Fwww.tiktok.com%2F%40user%2Fvideo%2F1234567890&audio=true
```

---

## Wiring it to the frontend (index.html)

In `index.html`, replace the demo `setTimeout` simulation and the `dl-btn`
toast handler with real calls:

```js
const API_BASE = "https://api.vidssaver.com"; // your deployed backend URL

// Instead of the setTimeout demo in saveBtn's click handler:
const res = await fetch(`${API_BASE}/api/info`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url })
});
const data = await res.json();
if (!data.ok) { showToast(data.error); return; }
// populate resultTitle / resultMeta / dl-btn hrefs from data.video ...

// Each download button becomes a direct link, e.g.:
// hdBtn.href = `${API_BASE}/api/download?url=${encodeURIComponent(url)}&formatId=${data.video.formats.hd.formatId}`;
// audioBtn.href = `${API_BASE}/api/download?url=${encodeURIComponent(url)}&audio=true`;
```

---

## Security notes

- All shell commands are run via `spawn()` with an **argument array**, never a
  shell string, so pasted URLs can never break out into shell commands.
- Every URL is validated against strict TikTok/Instagram/Facebook patterns
  before it's ever passed to yt-dlp.
- Rate limiting (`express-rate-limit`) caps requests per IP.
- `helmet` sets safe default HTTP headers; CORS is locked to `ALLOWED_ORIGINS`.
- Temp files are deleted immediately after each download finishes or fails —
  nothing is retained on disk.
- Errors are mapped to safe, generic messages; stack traces and file paths are
  logged server-side only, never sent to the client.

---

## Project structure

```
vidssaver-backend/
├── server.js                 # entry point
├── src/
│   ├── app.js                 # express app, middleware wiring
│   ├── routes/api.js          # /api/health, /api/info, /api/download
│   ├── controllers/videoController.js
│   ├── services/ytdlp.js      # yt-dlp process wrapper
│   ├── middleware/errorHandler.js
│   └── utils/validators.js    # URL / platform validation
├── tmp/                       # temp download files (auto-cleaned)
├── .env.example
└── package.json
```

## Legal note

This tool only works with **public** videos and is intended for personal use.
Respect each platform's terms of service and the original creator's rights —
add attribution when resharing content that isn't yours.
