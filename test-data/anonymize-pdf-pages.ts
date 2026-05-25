/**
 * Anonymize a Trading212 PDF page-text JSON fixture for committing as test data.
 *
 * Strips customer-identifying information (name, customer ID, account IDs) while
 * preserving everything the parser + engine need (currencies, dates, position
 * sizes, prices, ISINs, instrument names, gain/loss numbers, percentages).
 *
 * Usage:
 *   npx tsx test-data/anonymize-pdf-pages.ts <input.json> <output.json>
 *
 * Workflow when a customer reports a parse issue (with their consent):
 *   1. Extract their PDF locally:
 *      npx tsx test-data/extract-fixture.ts <path/to/their.pdf> <tmp/pages.json>
 *   2. Inspect tmp/pages.json manually for anything not on the standard PII list.
 *   3. Anonymize:
 *      npx tsx test-data/anonymize-pdf-pages.ts tmp/pages.json test-data/fixtures/annual-statement-2025-<shape>.json
 *   4. Re-inspect the output. Commit only if you can show the customer.
 *
 * The customer's original PDF and the pre-anonymization JSON never get committed.
 */
import { readFileSync, writeFileSync } from 'fs';

/**
 * Anonymization rules:
 * - "CUSTOMER ID\tCUSTOMER NAME" header line: the line IMMEDIATELY after is the
 *   customer's ID + name; replace with "99999999\tAnonymized User".
 * - "ID CLIENT\tNUME CLIENT" (Romanian header): same handling.
 * - "Account ID: <digits>" / "Cont nr. <digits>" / "Cont nr.: <digits>": replace
 *   the digits with a sequential placeholder ("11111", "22222", "33333"...).
 *   Consistent across the file: the same source account ID always maps to the
 *   same placeholder, so cross-references stay coherent.
 * - Any line that consists only of a name pattern adjacent to the customer-header
 *   row (defensive fallback for layouts the strict next-line rule misses).
 *
 * Preserved (NEVER touched):
 * - ISINs, instrument names, position sizes, prices, FX rates, gain/loss numbers.
 * - Dates, currencies, country codes, WHT percentages.
 * - Section headings ("Overview", "Annual Statement - YYYY", "Trading 212 Invest", etc.).
 * - T212's own legal address block (London / Cyprus footer text).
 * - Page numbers ("1/6", "2/6", ...).
 */

const CUSTOMER_HEADER_PATTERNS = [
  /^CUSTOMER ID\tCUSTOMER NAME$/i,
  /^ID CLIENT\tNUME CLIENT$/i,
];

const ANONYMIZED_CUSTOMER_LINE = '99999999\tAnonymized User';

const ACCOUNT_ID_PATTERN = /(Account ID:|Cont nr\.?:?)\s*(\d+)/gi;

export interface AnonymizeResult {
  pages: string[];
  replacements: {
    customerLines: number;
    accountIds: number;
    uniqueAccountIds: number;
  };
}

export function anonymizePages(pages: string[]): AnonymizeResult {
  let customerLineCount = 0;
  let accountIdCount = 0;
  const accountIdMap = new Map<string, string>();

  function getPlaceholder(originalId: string): string {
    if (!accountIdMap.has(originalId)) {
      const sequence = accountIdMap.size + 1;
      // 11111, 22222, 33333... cap at 99999 (5 digits, repeated)
      const digit = Math.min(sequence, 9);
      accountIdMap.set(originalId, String(digit).repeat(5));
    }
    return accountIdMap.get(originalId)!;
  }

  const anonymized = pages.map(page => {
    const lines = page.split('\n');
    const out: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Replace the line right after a customer-header row.
      const prevLine = i > 0 ? lines[i - 1] : '';
      if (CUSTOMER_HEADER_PATTERNS.some(p => p.test(prevLine))) {
        out.push(ANONYMIZED_CUSTOMER_LINE);
        customerLineCount += 1;
        continue;
      }

      // Replace "Account ID: NNNN" / "Cont nr. NNNN" patterns inline (any
      // number of occurrences per line, including the multi-account horizontal
      // layout where three Account IDs sit on one line).
      const replaced = line.replace(ACCOUNT_ID_PATTERN, (_match, label: string, id: string) => {
        accountIdCount += 1;
        return `${label} ${getPlaceholder(id)}`;
      });

      out.push(replaced);
    }

    return out.join('\n');
  });

  return {
    pages: anonymized,
    replacements: {
      customerLines: customerLineCount,
      accountIds: accountIdCount,
      uniqueAccountIds: accountIdMap.size,
    },
  };
}

function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    console.error('Usage: npx tsx test-data/anonymize-pdf-pages.ts <input.json> <output.json>');
    process.exit(1);
  }

  const raw = readFileSync(inputPath, 'utf8');
  const pages = JSON.parse(raw) as string[];
  if (!Array.isArray(pages) || !pages.every(p => typeof p === 'string')) {
    console.error('Input must be a JSON array of strings (one per page).');
    process.exit(1);
  }

  const { pages: anonymized, replacements } = anonymizePages(pages);
  writeFileSync(outputPath, JSON.stringify(anonymized, null, 2));

  console.log(`Anonymized ${pages.length} pages -> ${outputPath}`);
  console.log(`  Customer header rows replaced: ${replacements.customerLines}`);
  console.log(`  Account ID occurrences replaced: ${replacements.accountIds}`);
  console.log(`  Unique account IDs mapped: ${replacements.uniqueAccountIds}`);
}

// Only run main() when invoked as a script, not when imported by tests.
const isMainModule = process.argv[1]?.endsWith('anonymize-pdf-pages.ts') ||
                     process.argv[1]?.endsWith('anonymize-pdf-pages.js');
if (isMainModule) {
  main();
}
