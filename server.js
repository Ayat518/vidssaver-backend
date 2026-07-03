require("dotenv").config();

const createApp = require("./src/app");

const PORT = process.env.PORT || 5000;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`[vidssaver-api] listening on port ${PORT} (${process.env.NODE_ENV || "development"})`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`[vidssaver-api] received ${signal}, shutting down...`);
  server.close(() => {
    console.log("[vidssaver-api] closed all connections. Bye.");
    process.exit(0);
  });
  // Force-exit if something hangs
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("[vidssaver-api] Unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[vidssaver-api] Uncaught exception:", err);
});
