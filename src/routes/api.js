const express = require("express");
const rateLimit = require("express-rate-limit");
const { getInfo, downloadVideo } = require("../controllers/videoController");

const router = express.Router();

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Please slow down and try again shortly." }
});

router.use(limiter);

router.get("/health", (req, res) => {
  res.status(200).json({ ok: true, status: "healthy", time: new Date().toISOString() });
});

// Fetch metadata + available formats for a pasted link
router.post("/info", getInfo);

// Stream the actual video/audio file to the browser
router.get("/download", downloadVideo);

module.exports = router;
