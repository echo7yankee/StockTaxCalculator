#!/usr/bin/env tsx
/**
 * Generates the iOS apple-touch-icon at client/public/apple-touch-icon.png
 * (180x180 PNG).
 *
 * Renders the InvesTax mark on a solid navy background via headless Chromium.
 * iOS adds its own rounded-corner mask, so the source PNG has NO border
 * radius — solid square with full-bleed background.
 *
 * Usage:
 *   npx tsx scripts/generate-apple-touch-icon.ts
 *
 * Referenced by client/index.html via:
 *   <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
 */

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, '..', 'client', 'public', 'apple-touch-icon.png');
const SIZE = 180;

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${SIZE}px; height: ${SIZE}px; overflow: hidden; }
  body {
    background: #0B1426;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  svg { width: 124px; height: 124px; }
</style>
</head>
<body>
  <svg viewBox="0 0 32 32" fill="none">
    <path d="M6 22L13 15L18 19L26 10" stroke="#60A5FA" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 10H26V15" stroke="#60A5FA" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
</body>
</html>`;

async function main(): Promise<void> {
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: SIZE, height: SIZE },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: 'networkidle' });
    const buffer = await page.screenshot({ type: 'png', fullPage: false, omitBackground: false });
    await writeFile(OUTPUT_PATH, buffer);
    console.log(`Wrote ${OUTPUT_PATH} (${buffer.length} bytes, ${SIZE}x${SIZE})`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
