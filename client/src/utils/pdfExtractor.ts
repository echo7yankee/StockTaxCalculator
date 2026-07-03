/**
 * Extract structured text from a Trading212 Annual Statement PDF.
 * Uses pdfjs-dist with positional text items to reconstruct table rows.
 */
// Installs Promise.withResolvers on the main thread before pdf.js loads.
import './promiseWithResolversPolyfill';
import * as pdfjsLib from 'pdfjs-dist';
// Our own worker entry (see pdfWorker.ts): a polyfill-first wrapper around the
// pdf.js worker, so Promise.withResolvers exists in the worker scope too.
import PdfWorker from './pdfWorker?worker';

// Route pdf.js through the wrapped worker. workerPort overrides workerSrc and
// takes a Worker instance. Configured lazily on first use so the module never
// instantiates a Worker at import time (keeps it safe under Node/prerender,
// where a Worker constructor would not exist).
let workerConfigured = false;
function ensureWorkerConfigured(): void {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();
  workerConfigured = true;
}

interface TextItem {
  str: string;
  x: number;
  y: number;
}

/**
 * Extract text from a PDF, grouping items into lines by Y position.
 * Returns one string per page, with items on the same line joined by tabs.
 */
export async function extractPdfPageTexts(file: File): Promise<string[]> {
  ensureWorkerConfigured();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Collect text items with positions
    const items: TextItem[] = [];
    for (const item of content.items) {
      if ('str' in item && item.str.trim()) {
        const tx = item.transform;
        items.push({
          str: item.str.trim(),
          x: tx[4],    // horizontal position
          y: tx[5],    // vertical position (higher = higher on page)
        });
      }
    }

    // Group items by Y position (same line within 3px tolerance)
    const lines = new Map<number, TextItem[]>();
    for (const item of items) {
      // Find existing line within tolerance
      let lineY = -1;
      for (const key of lines.keys()) {
        if (Math.abs(key - item.y) < 3) {
          lineY = key;
          break;
        }
      }
      if (lineY < 0) {
        lineY = item.y;
        lines.set(lineY, []);
      }
      lines.get(lineY)!.push(item);
    }

    // Sort lines top to bottom (higher Y = higher on page in PDF coords)
    const sortedLines = [...lines.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => {
        // Sort items left to right within line
        items.sort((a, b) => a.x - b.x);
        return items.map(i => i.str).join('\t');
      });

    pageTexts.push(sortedLines.join('\n'));
  }

  return pageTexts;
}
