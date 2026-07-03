const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const YTDLP_PATH = process.env.YTDLP_PATH || "yt-dlp";
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
const TMP_DIR = process.env.TMP_DIR || path.join(__dirname, "..", "..", "tmp");
const PROCESS_TIMEOUT_MS = Number(process.env.PROCESS_TIMEOUT_MS || 60000);

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

/**
 * Runs an external binary with a fixed argument array (never a shell string),
 * which is what makes this safe against command injection regardless of
 * what the caller passes as the video URL.
 */
function runProcess(bin, args, { timeoutMs = PROCESS_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new AppProcessError("TIMEOUT", `${bin} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // ENOENT usually means the binary isn't installed / not on PATH
      if (err.code === "ENOENT") {
        reject(new AppProcessError("BINARY_NOT_FOUND", `${bin} is not installed or not on PATH`));
      } else {
        reject(new AppProcessError("SPAWN_ERROR", err.message));
      }
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new AppProcessError("PROCESS_FAILED", stderr || `${bin} exited with code ${code}`));
      }
    });
  });
}

class AppProcessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AppProcessError";
    this.code = code;
  }
}

/**
 * Fetches metadata (title, thumbnail, duration, available formats) for a video
 * without downloading it, using `yt-dlp -j` (dump single JSON).
 */
async function fetchVideoInfo(url) {
  const args = [
    "-j", // dump JSON metadata only, no download
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout", "20",
    url
  ];

  const { stdout } = await runProcess(YTDLP_PATH, args);

  let data;
  try {
    data = JSON.parse(stdout.trim().split("\n")[0]);
  } catch (err) {
    throw new AppProcessError("PARSE_ERROR", "Could not read video information for this link.");
  }

  return normalizeInfo(data);
}

/**
 * Reduces yt-dlp's large raw format list down to a small, user-facing set:
 * one HD mp4, one SD mp4, and an mp3 audio option.
 */
function normalizeInfo(data) {
  const formats = Array.isArray(data.formats) ? data.formats : [];

  const mp4WithAudio = formats.filter(
    (f) => f.ext === "mp4" && f.vcodec && f.vcodec !== "none" && f.acodec && f.acodec !== "none"
  );

  const sorted = mp4WithAudio.sort((a, b) => (b.height || 0) - (a.height || 0));

  const hd = sorted.find((f) => (f.height || 0) >= 720) || sorted[0] || null;
  const sd =
    sorted.find((f) => (f.height || 0) < 720 && (f.height || 0) >= 360) ||
    sorted[sorted.length - 1] ||
    null;

  return {
    id: data.id,
    platform: data.extractor_key ? data.extractor_key.toLowerCase() : null,
    title: (data.title || "Untitled video").slice(0, 200),
    thumbnail: data.thumbnail || null,
    durationSeconds: typeof data.duration === "number" ? Math.round(data.duration) : null,
    uploader: data.uploader || data.channel || null,
    formats: {
      hd: hd ? { formatId: hd.format_id, height: hd.height, ext: hd.ext } : null,
      sd: sd && sd !== hd ? { formatId: sd.format_id, height: sd.height, ext: sd.ext } : null,
      audio: { formatId: "bestaudio", ext: "mp3" }
    }
  };
}

/**
 * Downloads a video (or extracts audio) to a temp file and returns its path.
 * The caller is responsible for streaming the file to the client and deleting it.
 */
async function downloadToFile(url, { formatId, audioOnly = false } = {}) {
  const jobId = uuidv4();
  const outputTemplate = path.join(TMP_DIR, `${jobId}.%(ext)s`);

  const args = [
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout", "20",
    "-o", outputTemplate
  ];

  if (audioOnly) {
    args.push("-x", "--audio-format", "mp3", "--ffmpeg-location", FFMPEG_PATH);
  } else if (formatId) {
    args.push("-f", formatId);
  } else {
    // Sensible default: best mp4 with audio, capped at 1080p for speed
    args.push("-f", "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best");
  }

  args.push(url);

  await runProcess(YTDLP_PATH, args, { timeoutMs: PROCESS_TIMEOUT_MS });

  const producedFile = findProducedFile(jobId);
  if (!producedFile) {
    throw new AppProcessError("FILE_NOT_FOUND", "The video was processed but the output file could not be located.");
  }

  return producedFile;
}

function findProducedFile(jobId) {
  const files = fs.readdirSync(TMP_DIR).filter((f) => f.startsWith(jobId));
  if (files.length === 0) return null;
  return path.join(TMP_DIR, files[0]);
}

function cleanupFile(filePath) {
  fs.unlink(filePath, () => {
    /* best-effort cleanup; ignore errors if already removed */
  });
}

module.exports = {
  fetchVideoInfo,
  downloadToFile,
  cleanupFile,
  AppProcessError
};
