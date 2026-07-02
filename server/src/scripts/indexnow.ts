// Operator-run IndexNow ping CLI: reads the public sitemap and submits every
// URL to api.indexnow.org (Bing, Yandex, Seznam, etc.). Push-based indexing,
// no Bing Webmaster account required; the key file is served from
// client/public/<key>.txt like llms.txt. Run once after any deploy that
// changes public pages. Requires a built dist (npm run build -w server).
//
//   npm run indexnow -w server                 # submit all sitemap URLs
//   npm run indexnow -w server -- --dry-run    # print the payload, no network
//
// Backlog 8.1 #27 (distribution-diagnosis-2026-07.md P1).
//
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const INDEXNOW_KEY = '63495dafc70b91c092d0289641bafc0c';
export const INDEXNOW_HOST = 'investax.app';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

// Resolved from dist/scripts/indexnow.js -> repo root -> client/public.
const SITEMAP_PATH = new URL('../../../client/public/sitemap.xml', import.meta.url);
const KEY_FILE_PATH = new URL(
  `../../../client/public/${INDEXNOW_KEY}.txt`,
  import.meta.url
);

/** Extract <loc> URLs from sitemap XML. Throws if none parse or a loc is off-host. */
export function parseSitemapLocs(xml: string): string[] {
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);
  if (locs.length === 0) {
    throw new Error('no <loc> entries found in sitemap');
  }
  const prefix = `https://${INDEXNOW_HOST}/`;
  for (const loc of locs) {
    if (!loc.startsWith(prefix)) {
      throw new Error(`sitemap <loc> is not on ${INDEXNOW_HOST}: ${loc}`);
    }
  }
  return locs;
}

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

export function buildIndexNowPayload(urls: string[]): IndexNowPayload {
  return {
    host: INDEXNOW_HOST,
    key: INDEXNOW_KEY,
    keyLocation: `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };
}

export async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  // Guard against key-file drift: the served key file must match the constant,
  // otherwise the search engines reject the submission as unverified.
  const keyFileContent = readFileSync(fileURLToPath(KEY_FILE_PATH), 'utf8').trim();
  if (keyFileContent !== INDEXNOW_KEY) {
    throw new Error(
      `key file ${INDEXNOW_KEY}.txt content does not match INDEXNOW_KEY (found "${keyFileContent}")`
    );
  }

  const urls = parseSitemapLocs(readFileSync(fileURLToPath(SITEMAP_PATH), 'utf8'));
  const payload = buildIndexNowPayload(urls);

  console.log(`[indexnow] ${urls.length} URL(s) from sitemap.xml for ${INDEXNOW_HOST}`);
  for (const url of urls) console.log(`  ${url}`);

  if (dryRun) {
    console.log('[indexnow] --dry-run: not submitting');
    return;
  }

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });

  // Per the IndexNow spec: 200 = OK, 202 = accepted (key validation pending).
  if (res.status === 200 || res.status === 202) {
    console.log(`[indexnow] submitted, HTTP ${res.status}`);
  } else {
    const body = await res.text().catch(() => '');
    throw new Error(`IndexNow rejected the submission: HTTP ${res.status} ${body}`.trim());
  }
}

// Run only when executed directly (node dist/scripts/indexnow.js), never on
// import: tests import the pure functions above without touching the network.
const isDirectRun = (() => {
  try {
    return process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  try {
    await main();
  } catch (err) {
    console.error(`[indexnow] ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
