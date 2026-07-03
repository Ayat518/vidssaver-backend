const fs = require("fs");
const path = require("path");
const { validateVideoUrl } = require("../utils/validators");
const { fetchVideoInfo, downloadToFile, cleanupFile, AppProcessError } = require("../services/ytdlp");

/**
 * POST /api/info
 * body: { url: string }
 * Returns video metadata + the format options the frontend should offer.
 */
async function getInfo(req, res, next) {
  try {
    const { url } = req.body || {};
    const check = validateVideoUrl(url);

    if (!check.valid) {
      return res.status(400).json({ ok: false, error: check.error });
    }

    const info = await fetchVideoInfo(url);

    return res.status(200).json({
      ok: true,
      platform: check.platform,
      video: info
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/download?url=...&formatId=...&audio=true|false
 * Streams the actual file to the client with a proper filename, then
 * deletes the temp file once the response finishes (success or failure).
 */
async function downloadVideo(req, res, next) {
  const { url, formatId, audio } = req.query;
  const check = validateVideoUrl(url);

  if (!check.valid) {
    return res.status(400).json({ ok: false, error: check.error });
  }

  let filePath = null;

  try {
    filePath = await downloadToFile(url, {
      formatId: formatId || null,
      audioOnly: audio === "true"
    });

    const ext = path.extname(filePath) || (audio === "true" ? ".mp3" : ".mp4");
    const downloadName = `vidssaver-${check.platform}-${Date.now()}${ext}`;

    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    res.setHeader("Content-Type", audio === "true" ? "audio/mpeg" : "video/mp4");

    const stream = fs.createReadStream(filePath);

    stream.on("error", (err) => {
      cleanupFile(filePath);
      next(err);
    });

    res.on("finish", () => cleanupFile(filePath));
    res.on("close", () => cleanupFile(filePath));

    stream.pipe(res);
  } catch (err) {
    if (filePath) cleanupFile(filePath);
    return next(err);
  }
}

module.exports = { getInfo, downloadVideo };
