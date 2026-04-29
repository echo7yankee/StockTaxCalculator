#!/usr/bin/env tsx
/**
 * Generates the OpenGraph / Twitter Card share image at
 * client/public/og-image.png (1200x630 PNG).
 *
 * Renders a self-contained branded HTML template via headless Chromium and
 * screenshots it. Run when branding, tagline, or tax-year scoping changes.
 *
 * Usage:
 *   npx tsx scripts/generate-og-image.ts
 *
 * Referenced by client/index.html OG/Twitter meta tags. The PNG is committed
 * to the repo and served from the Vite static-asset pipeline at /og-image.png.
 */

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, '..', 'client', 'public', 'og-image.png');
const WIDTH = 1200;
const HEIGHT = 630;

const html = `<!DOCTYPE html>
<html lang="ro">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
  }
  body {
    background: linear-gradient(135deg, #060D1A 0%, #0B1426 50%, #111D35 100%);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #F1F5F9;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 60px 80px;
    position: relative;
  }
  body::before {
    content: '';
    position: absolute;
    top: -240px;
    right: -240px;
    width: 640px;
    height: 640px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(37, 99, 235, 0.22) 0%, rgba(37, 99, 235, 0) 60%);
    pointer-events: none;
  }
  body::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 8px;
    background: linear-gradient(180deg, transparent 0%, #2563EB 25%, #60A5FA 75%, transparent 100%);
  }
  .header {
    display: flex;
    align-items: center;
    gap: 18px;
    position: relative;
    z-index: 1;
  }
  .logo {
    width: 64px;
    height: 64px;
    border-radius: 14px;
    background: #0B1426;
    border: 1px solid #1E3A5F;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .logo svg { width: 40px; height: 40px; }
  .wordmark {
    font-size: 38px;
    font-weight: 700;
    letter-spacing: -0.025em;
    color: #F1F5F9;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 24px;
    position: relative;
    z-index: 1;
  }
  h1 {
    font-size: 76px;
    font-weight: 800;
    line-height: 1.04;
    letter-spacing: -0.035em;
    color: #F1F5F9;
    max-width: 980px;
  }
  .accent { color: #60A5FA; }
  .tagline {
    font-size: 28px;
    font-weight: 500;
    color: #94A3B8;
    line-height: 1.35;
    max-width: 920px;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
    z-index: 1;
  }
  .domain {
    font-size: 30px;
    font-weight: 700;
    color: #60A5FA;
    letter-spacing: -0.015em;
  }
  .badges { display: flex; gap: 14px; }
  .badge {
    background: rgba(37, 99, 235, 0.14);
    border: 1px solid rgba(96, 165, 250, 0.32);
    color: #BFDBFE;
    padding: 9px 18px;
    border-radius: 999px;
    font-size: 18px;
    font-weight: 500;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M6 22L13 15L18 19L26 10" stroke="#60A5FA" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M21 10H26V15" stroke="#60A5FA" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="wordmark">InvesTax</div>
  </div>

  <div class="content">
    <h1>Calculează-ți <span class="accent">impozitele pe investiții</span> în 2 minute</h1>
    <div class="tagline">Din PDF Trading212 în Declarația Unică. Câștiguri, dividende, CASS.</div>
  </div>

  <div class="footer">
    <div class="domain">investax.app</div>
    <div class="badges">
      <div class="badge">An fiscal 2025</div>
      <div class="badge">Deadline 25 mai 2026</div>
    </div>
  </div>
</body>
</html>`;

async function main(): Promise<void> {
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: 'networkidle' });
    const buffer = await page.screenshot({
      type: 'png',
      fullPage: false,
      omitBackground: false,
    });
    await writeFile(OUTPUT_PATH, buffer);
    console.log(`Wrote ${OUTPUT_PATH} (${buffer.length} bytes, ${WIDTH}x${HEIGHT})`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
