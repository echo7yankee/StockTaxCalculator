/**
 * Extracts page texts from a Trading212 PDF into a JSON fixture file
 * for use in unit tests (avoids needing pdfjs-dist canvas/worker in Node).
 *
 * Usage: npx tsx test-data/extract-fixture.ts
 *
 * Uses pdfjs-dist with DOMMatrix polyfill for Node.js compatibility.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

// Polyfill browser APIs that pdfjs-dist expects
(globalThis as any).DOMMatrix = class DOMMatrix {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  m11 = 1; m12 = 0; m21 = 0; m22 = 1; m41 = 0; m42 = 0;
  isIdentity = true;

  constructor(init?: number[]) {
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      this.m11 = this.a; this.m12 = this.b;
      this.m21 = this.c; this.m22 = this.d;
      this.m41 = this.e; this.m42 = this.f;
    }
  }

  inverse() { return new DOMMatrix(); }
  multiply() { return new DOMMatrix(); }
  translate() { return new DOMMatrix(); }
  scale() { return new DOMMatrix(); }
  transformPoint(p?: any) { return p || { x: 0, y: 0 }; }
  static fromMatrix() { return new DOMMatrix(); }
  static fromFloat64Array(a: Float64Array) { return new DOMMatrix(Array.from(a)); }
  static fromFloat32Array(a: Float32Array) { return new DOMMatrix(Array.from(a)); }
};

(globalThis as any).ImageData = class ImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  constructor(w: number, h: number) {
    this.width = w || 1;
    this.height = h || 1;
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
  }
};

(globalThis as any).Path2D = class Path2D {
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  closePath() {}
  rect() {}
  arc() {}
  ellipse() {}
};

interface TextItem {
  str: string;
  transform: number[];
}

async function extractPageTexts(pdfPath: string): Promise<string[]> {
  const workerPath = resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `file:///${workerPath.replace(/\\/g, '/')}`;

  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    // Group text items by Y position (with tolerance)
    const items = (content.items as TextItem[]).filter(
      (item) => 'str' in item && item.str.trim() !== ''
    );

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
        items.sort((a, b) => a.x - b.x).map((i) => i.text).join('\t')
      );

    pages.push(sortedLines.join('\n'));
  }

  await doc.destroy();
  return pages;
}

async function main() {
  const pdfPath = join(__dirname, 'annual-statement-2025.pdf');
  const outputDir = join(__dirname, 'fixtures');
  const outputPath = join(outputDir, 'annual-statement-2025-pages.json');

  console.log(`Extracting from: ${pdfPath}`);

  const pageTexts = await extractPageTexts(pdfPath);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(pageTexts, null, 2));
  console.log(`Written ${pageTexts.length} pages to: ${outputPath}`);

  // Print summary
  for (let i = 0; i < pageTexts.length; i++) {
    const lines = pageTexts[i].split('\n');
    console.log(
      `  Page ${i + 1}: ${lines.length} lines, first: "${lines[0]?.substring(0, 80)}..."`
    );
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
