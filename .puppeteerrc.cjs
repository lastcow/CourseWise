// Keep `pnpm install` light everywhere: do NOT auto-download Chrome for
// puppeteer on install. Only the web prerender step needs a browser, and it
// installs one explicitly via `puppeteer browsers install chrome` (CI deploy
// job + local `pnpm --filter @coursewise/web prerender`). This avoids a ~150MB
// Chrome download in the PR/test/migrate jobs that never prerender.
module.exports = {
  skipDownload: true,
};
