// Build-time prerender for PUBLIC pages only.
//
// Why: the app is a client-rendered SPA, so non-JS crawlers (AI/search bots)
// would otherwise see an empty shell. This serves the freshly-built dist with
// Vite's preview server, loads each public route in headless Chrome (real
// browser → no SSR-safety refactor of the app needed), and writes the rendered
// HTML back to dist/<route>/index.html. The hashed module script stays in the
// output, so real users still boot the SPA normally; crawlers get real content.
//
// Runs AFTER `vite build` (dist must exist). Per-route failures are non-fatal
// (that route just keeps the SPA shell); a browser/server failure is fatal.
//
// Needs a Chrome binary. Auto-download is disabled (root .puppeteerrc.cjs), so
// install one first: `pnpm --filter @coursewise/web exec puppeteer browsers install chrome`.

import { preview } from 'vite';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const distDir = path.join(webRoot, 'dist');

// Public, indexable routes — must mirror sitemap.xml. Authenticated app routes
// and token pages are intentionally NOT prerendered.
const ROUTES = [
  '/',
  '/features',
  '/pricing',
  '/about',
  '/contact',
  '/changelog',
  '/legal/privacy',
  '/legal/terms',
  '/legal/ferpa',
  '/legal/coppa',
  '/legal/security',
  '/legal/subprocessors',
  '/legal/data-requests',
  '/legal/dpa',
  '/legal/accessibility',
  '/legal/cookies',
  '/legal/state-addenda',
  '/legal/responsible-disclosure',
];

const NAV_TIMEOUT_MS = 30_000;

async function main() {
  // dist must already exist (run `vite build` first).
  try {
    await fs.access(path.join(distDir, 'index.html'));
  } catch {
    console.error(`prerender: ${distDir}/index.html not found — run \`vite build\` first.`);
    process.exit(1);
  }

  const server = await preview({
    root: webRoot,
    preview: { port: 4173, strictPort: false, host: '127.0.0.1' },
  });
  const base = (server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:4173').replace(/\/$/, '');
  console.log(`prerender: preview server at ${base}`);

  const browser = await puppeteer.launch({
    headless: true,
    // --no-sandbox is required on most CI runners (no user namespaces).
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // Capture everything in memory FIRST, then write — so writing a prerendered
  // file mid-crawl can't change what the preview server serves for later routes.
  const captured = [];
  for (const route of ROUTES) {
    const page = await browser.newPage();
    try {
      await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      // Wait until React has mounted real content into #root.
      await page.waitForFunction(
        () => {
          const root = document.getElementById('root');
          return !!root && root.childElementCount > 0;
        },
        { timeout: NAV_TIMEOUT_MS },
      );
      // Small settle for i18n/effects that paint just after mount.
      await new Promise((r) => setTimeout(r, 150));
      const html = '<!doctype html>\n' + (await page.content()).replace(/^<!doctype html>/i, '');
      captured.push({ route, html });
      console.log(`  ✓ ${route} (${html.length} bytes)`);
    } catch (err) {
      console.warn(`  ⚠ skipped ${route}: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  await server.httpServer.close();

  for (const { route, html } of captured) {
    const outDir = route === '/' ? distDir : path.join(distDir, route);
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'index.html'), html, 'utf8');
  }

  console.log(`prerender: wrote ${captured.length}/${ROUTES.length} routes.`);
  if (captured.length === 0) {
    console.error('prerender: produced no pages — failing the build.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('prerender: fatal error:', err);
  process.exit(1);
});
