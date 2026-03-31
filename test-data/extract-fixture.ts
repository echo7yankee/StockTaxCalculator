/**
 * Extracts page texts from a Trading212 PDF into a JSON fixture file
 * for use in unit tests (avoids needing pdfjs-dist canvas/worker in Node).
 *
 * Usage: npx tsx test-data/extract-fixture.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Disable worker in Node
GlobalWorkerOptions.workerSrc = '';

interface TextItem {
  str: string;
  transform: number[];
}

async function extractPageTexts(pdfPath: string): Promise<string[]> {
  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    // Group text items by Y position (with tolerance)
    const items = content.items.filter((item): item is TextItem => 'str' in item && item.str.trim() !== '');

    const lines = new Map<number, { x: number; text: string }[]>();
    const tolerance = 3;

    for (const item of items) {
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];

      // Find existing line within tolerance
      let lineY = y;
      for (const existingY of lines.keys()) {
        if (Math.abs(existingY - y) <= tolerance) {
          lineY = existingY;
          break;
        }
      }

      if (!lines.has(lineY)) lines.set(lineY, []);
      lines.get(lineY)!.push({ x, text: item.str.trim() });
    }

    // Sort lines top to bottom (higher Y = higher on page in PDF coords)
    const sortedLines = [...lines.entries()]
      .sort(([a], [b]) => b - a)
      .map(([, items]) =>
        items.sort((a, b) => a.x - b.x).map(i => i.text).join('\t')
      );

    pages.push(sortedLines.join('\n'));
  }

  await doc.destroy();
  return pages;
}

async function main() {
  const pdfPath = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), 'annual-statement-2025.pdf');
  const outputDir = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), 'fixtures');
  const outputPath = join(outputDir, 'annual-statement-2025-pages.json');

  console.log(`Extracting from: ${pdfPath}`);

  const pageTexts = await extractPageTexts(pdfPath);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(pageTexts, null, 2));
  console.log(`Written ${pageTexts.length} pages to: ${outputPath}`);

  // Print summary
  for (let i = 0; i < pageTexts.length; i++) {
    const lines = pageTexts[i].split('\n');
    console.log(`  Page ${i + 1}: ${lines.length} lines, first: "${lines[0]?.substring(0, 80)}..."`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
