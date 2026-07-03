const PLATFORM_PATTERNS = {
  tiktok: /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/[^\s]+/i,
  instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|p|tv)\/[^\s]+/i,
  facebook: /(?:https?:\/\/)?(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch)\/[^\s]+/i
};

/**
 * Detects which platform a URL belongs to.
 * @param {string} rawUrl
 * @returns {"tiktok"|"instagram"|"facebook"|null}
 */
function detectPlatform(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const url = rawUrl.trim();

  for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (pattern.test(url)) return platform;
  }
  return null;
}

/**
 * Validates that a string is a well-formed, safe http(s) URL.
 * Rejects anything that isn't a plain http/https URL to avoid command injection
 * via crafted input (e.g. "; rm -rf" or shell metacharacters).
 * @param {string} rawUrl
 * @returns {boolean}
 */
function isSafeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  const url = rawUrl.trim();

  // Hard length cap - real video links are never this long
  if (url.length > 2048) return false;

  // Block shell metacharacters outright, defence in depth even though
  // we always call yt-dlp via spawn() with an argument array (never a shell string).
  if (/[;&|`$(){}<>\\]/.test(url)) return false;

  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    return false;
  }

  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

function validateVideoUrl(rawUrl) {
  if (!isSafeUrl(rawUrl)) {
    return { valid: false, platform: null, error: "That doesn't look like a valid link." };
  }
  const platform = detectPlatform(rawUrl);
  if (!platform) {
    return {
      valid: false,
      platform: null,
      error: "Only TikTok, Instagram and Facebook links are supported."
    };
  }
  return { valid: true, platform, error: null };
}

module.exports = { detectPlatform, isSafeUrl, validateVideoUrl };
