const { AppProcessError } = require("../services/ytdlp");

/**
 * Maps internal error codes to safe, user-friendly messages + HTTP status.
 * Nothing about the server's file paths, stack traces, or raw yt-dlp
 * stderr is ever sent to the client.
 */
function mapError(err) {
  if (err instanceof AppProcessError) {
    switch (err.code) {
      case "BINARY_NOT_FOUND":
        return { status: 503, message: "Download engine is not available right now. Please try again shortly." };
      case "TIMEOUT":
        return { status: 504, message: "This video took too long to process. Please try again." };
      case "PARSE_ERROR":
        return { status: 502, message: "Could not read this video's details. The link may be invalid or private." };
      case "FILE_NOT_FOUND":
        return { status: 500, message: "Something went wrong while preparing your download. Please try again." };
      case "PROCESS_FAILED":
        return { status: 422, message: "This video couldn't be fetched. It may be private, deleted, or region-locked." };
      default:
        return { status: 500, message: "Something went wrong. Please try again." };
    }
  }

  return { status: 500, message: "Something went wrong on our end. Please try again in a moment." };
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const { status, message } = mapError(err);

  // Log full detail server-side only, never expose it to the client.
  console.error(`[vidssaver-api] ${req.method} ${req.originalUrl} ->`, err.code || err.name, err.message);

  if (res.headersSent) {
    return res.end();
  }

  res.status(status).json({ ok: false, error: message });
}

function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, error: "Route not found." });
}

module.exports = { errorHandler, notFoundHandler };
