/**
 * Anonymize a broker export (IBKR Activity Statement CSV, Revolut Account
 * Statement .xlsx/.csv) for committing as a test fixture.
 *
 * The CSV/xlsx counterpart of `anonymize-pdf-pages.ts` (which covers Trading212
 * PDF page texts). Built for the beta-to-trusted sample intake: the Regression
 * Firewall (`investax-docs/09-backlog-and-discipline.md` Section 8.6 #5) gates
 * each beta broker on >=3 real anonymized user exports parsing correctly
 * end-to-end, and the #174 ghid waitlists actively solicit those exports.
 * Procedure: `docs/broker-sample-intake-runbook.md`.
 *
 * Usage:
 *   npx tsx test-data/anonymize-broker-export.ts ibkr    <input.csv>        <output.json>
 *   npx tsx test-data/anonymize-broker-export.ts revolut <input.xlsx|.csv>  <output.json>
 *
 * Output is a JSON array of row arrays (string[][]): the EXACT shape
 * `parseIbkrCsv` / `parseRevolutStatement` consume, matching what the upload
 * flow produces at runtime (`Papa.parse(file, { header: false, skipEmptyLines:
 * true })` for CSV; `read-excel-file` + cell-to-string coercion for xlsx, see
 * `xlsxCellToString` in `client/src/pages/UploadPage.tsx`).
 *
 * What gets anonymized (and what never does):
 *
 * IBKR (multi-section statement):
 * - `Account Information` section Data rows: `Name` / `Account Alias` values
 *   become "Anonymized User" / "anon"; `Account`/`Accounts` values become
 *   sequential placeholders; address/phone/email/bank-ish fields become
 *   "[removed]". Format-relevant values (Account Type, Customer Type, Base
 *   Currency, Account Capabilities) are PRESERVED.
 * - Any `U`-prefixed account number (`U1234567`) anywhere in the file maps to a
 *   sequential placeholder (`U0000001`, `U0000002`, ...), consistent across the
 *   file so cross-references stay coherent.
 *
 * Revolut (flat table, possibly with an xlsx title/preamble block above it):
 * - Every non-empty cell ABOVE the detected header row (`Date` / `Type` /
 *   `Total Amount`, same detection the parser uses) becomes "[removed]". The
 *   preamble is where the account holder's name and account identifiers live;
 *   without a real sample pinning its exact shape, scrubbing all of it is the
 *   safe default. Restore individual non-PII labels by hand only if needed.
 *
 * Both brokers, defensive sweep over every cell:
 * - Email addresses -> "[removed-email]".
 * - IBAN-shaped strings (2 letters + 2 digits + 11 or more alphanumerics) ->
 *   "[removed-iban]". ISINs are 12 characters total and can NOT match this
 *   (the pattern needs 15+), so instrument identifiers are never touched.
 * - Phone numbers -> "[removed-phone]": an international `+<country>` number, or
 *   a Romanian 10-digit 0-prefixed number (each allowing space/dot/dash/paren
 *   separators). These only ever appear in free-text cells (notes,
 *   descriptions); the financial columns the parser reads (amounts, quantities,
 *   prices, dates, FX rates) never take this shape, and the round-trip tests
 *   pin that they are left byte-identical.
 *   The sweep can in principle over-match an exotic broker reference code;
 *   that is the right direction (over-scrub beats a PII leak) and the printed
 *   counts make any unexpected replacement visible for manual review.
 *
 * NEVER touched: tickers, ISINs, instrument names, quantities, prices,
 * amounts, currencies, dates, FX rates, section/header rows, subtotal rows.
 *
 * WHAT THIS CANNOT DETECT: a person's NAME embedded in a free-text cell (a
 * transaction description, a memo, a counterparty field). There is no reliable
 * pattern for that, so it is deliberately NOT auto-scrubbed; the CLI prints an
 * explicit reminder and the runbook's manual grep step is the backstop. The
 * account placeholders (`U0000001`, ...) are also guaranteed never to collide
 * with a real account number present in the file, so a real account can never
 * survive as its own placeholder.
 *
 * The customer's original file and any pre-anonymization conversion never get
 * committed. Manual re-inspection of the output is mandatory before commit
 * (see the runbook's grep step).
 */
import { readFileSync, writeFileSync } from 'fs';

export type BrokerKind = 'ibkr' | 'revolut';

export interface BrokerAnonymizeResult {
  rows: string[][];
  replacements: {
    /** IBKR `Account Information` field values scrubbed (Name, address, ...). */
    accountInfoValues: number;
    /** `U<digits>` account-number occurrences replaced (IBKR). */
    accountIds: number;
    uniqueAccountIds: number;
    /** Non-empty preamble cells scrubbed above the header row (Revolut). */
    preambleCells: number;
    emails: number;
    ibans: number;
    /** Phone-shaped strings replaced by the defensive sweep. */
    phones: number;
  };
}

/** IBKR account numbers: `U` + 6-8 digits (e.g. `U1234567`). Word-bounded so
 *  tickers like Unity's `U` (no digits) and 12-char ISINs (letter follows the
 *  `U`) never match. */
const IBKR_ACCOUNT_ID_RE = /\bU\d{6,8}\b/g;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** IBAN: 2-letter country + 2 check digits + 11..30 alphanumerics (15+ chars
 *  total). An ISIN is 12 chars total, below the minimum, so it never matches. */
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;

/** Phone numbers in free-text cells. Two clearly-phone shapes only, to avoid
 *  scrubbing financial data: an international `+<country>` number, or a Romanian
 *  10-digit 0-prefixed number, each allowing space/dot/dash/paren separators.
 *  Broker amounts/quantities/prices/dates never carry a leading `+` nor the RO
 *  10-digit 0-prefixed shape, so the round-trip parse is unaffected (pinned by
 *  the round-trip tests). ISIN digits (`US0378331005`) have no word boundary
 *  before their leading digit, so they never match the RO branch. */
const PHONE_RE = /(?:\+\d[\d\s().-]{6,}\d)|(?:\b0\d(?:[\s.-]?\d){8}\b)/g;

/** IBKR `Account Information` field names whose values are personal data. */
const IBKR_PII_NAME_FIELD_RE = /^name$/i;
const IBKR_PII_ALIAS_FIELD_RE = /^account alias$/i;
const IBKR_PII_ACCOUNT_FIELD_RE = /^accounts?$/i;
const IBKR_PII_CONTACT_FIELD_RE = /(address|street|city|postal|zip|phone|e-?mail|iban|bank)/i;

export function anonymizeBrokerRows(rows: string[][], broker: BrokerKind): BrokerAnonymizeResult {
  const replacements = {
    accountInfoValues: 0,
    accountIds: 0,
    uniqueAccountIds: 0,
    preambleCells: 0,
    emails: 0,
    ibans: 0,
    phones: 0,
  };

  // Pre-scan every cell for real IBKR account numbers so generated placeholders
  // can skip them. Without this, the k-th placeholder `U000000k` can equal a
  // real account number present in the file; if it equals that account's OWN
  // number, the "anonymization" is a no-op and the real number leaks verbatim.
  // Gets likelier with more accounts (the counter climbs into real-number
  // ranges), which is the ">N-account collision" failure mode.
  const realAccountIds = new Set<string>();
  if (broker === 'ibkr') {
    for (const row of rows) {
      for (const cell of row ?? []) {
        const matches = (cell ?? '').match(IBKR_ACCOUNT_ID_RE);
        if (matches) for (const m of matches) realAccountIds.add(m);
      }
    }
  }

  const accountIdMap = new Map<string, string>();
  let accountCounter = 0;
  function accountPlaceholder(originalId: string): string {
    if (!accountIdMap.has(originalId)) {
      let candidate: string;
      do {
        accountCounter += 1;
        candidate = `U${String(accountCounter).padStart(7, '0')}`;
      } while (realAccountIds.has(candidate));
      accountIdMap.set(originalId, candidate);
    }
    return accountIdMap.get(originalId)!;
  }

  // Revolut: locate the header row the same way the parser does (a row carrying
  // Date + Type + Total Amount). Everything above it is preamble.
  let revolutHeaderIdx = -1;
  if (broker === 'revolut') {
    for (let i = 0; i < rows.length; i++) {
      const norms = new Set((rows[i] ?? []).map((c) => (c ?? '').trim().toLowerCase().replace(/\s+/g, ' ')));
      if (norms.has('date') && norms.has('type') && norms.has('total amount')) {
        revolutHeaderIdx = i;
        break;
      }
    }
    if (revolutHeaderIdx === -1) {
      throw new Error(
        'No Revolut Account Statement header row found (Date / Type / Total Amount). ' +
          'Refusing to anonymize a file we cannot identify; check the export type (see docs/revolut-csv-format.md).'
      );
    }
  }

  function sweepCell(cell: string): string {
    let out = cell;
    out = out.replace(EMAIL_RE, () => {
      replacements.emails += 1;
      return '[removed-email]';
    });
    out = out.replace(IBAN_RE, () => {
      replacements.ibans += 1;
      return '[removed-iban]';
    });
    out = out.replace(PHONE_RE, () => {
      replacements.phones += 1;
      return '[removed-phone]';
    });
    if (broker === 'ibkr') {
      out = out.replace(IBKR_ACCOUNT_ID_RE, (id) => {
        replacements.accountIds += 1;
        return accountPlaceholder(id);
      });
    }
    return out;
  }

  const anonymized = rows.map((row, rowIdx) => {
    // Revolut preamble: scrub every non-empty cell wholesale.
    if (broker === 'revolut' && rowIdx < revolutHeaderIdx) {
      return (row ?? []).map((cell) => {
        if ((cell ?? '').trim() === '') return cell ?? '';
        replacements.preambleCells += 1;
        return '[removed]';
      });
    }

    const isIbkrAccountInfoData =
      broker === 'ibkr' &&
      (row?.[0] ?? '').trim() === 'Account Information' &&
      (row?.[1] ?? '').trim() === 'Data';
    const fieldName = isIbkrAccountInfoData ? (row?.[2] ?? '').trim() : '';

    return (row ?? []).map((cell, colIdx) => {
      const value = cell ?? '';

      // IBKR Account Information: scrub PII field VALUES (col 3+), keep the
      // field names and the format-relevant values.
      if (isIbkrAccountInfoData && colIdx >= 3 && value.trim() !== '') {
        if (IBKR_PII_NAME_FIELD_RE.test(fieldName)) {
          replacements.accountInfoValues += 1;
          return 'Anonymized User';
        }
        if (IBKR_PII_ALIAS_FIELD_RE.test(fieldName)) {
          replacements.accountInfoValues += 1;
          return 'anon';
        }
        if (IBKR_PII_ACCOUNT_FIELD_RE.test(fieldName)) {
          // Usually `U<digits>` (covered by the global map, which keeps the
          // placeholder consistent with other occurrences); anything else in an
          // account field is still an identifier, so scrub it too. Route it
          // through the same map (keyed by the raw value) rather than a
          // hardcoded `U0000001`, which would collide with the first real
          // account's placeholder.
          const swept = sweepCell(value);
          if (swept !== value) return swept;
          replacements.accountInfoValues += 1;
          return accountPlaceholder(value);
        }
        if (IBKR_PII_CONTACT_FIELD_RE.test(fieldName)) {
          replacements.accountInfoValues += 1;
          return '[removed]';
        }
      }

      return sweepCell(value);
    });
  });

  replacements.uniqueAccountIds = accountIdMap.size;
  return { rows: anonymized, replacements };
}

/** Coerce a read-excel-file cell to a string, mirroring `xlsxCellToString` in
 *  `client/src/pages/UploadPage.tsx` so the fixture matches what the parser
 *  sees at runtime (Date cells become ISO strings). */
function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString();
  return String(cell);
}

async function readInputRows(inputPath: string): Promise<string[][]> {
  if (/\.xlsx$/i.test(inputPath)) {
    // Lazy import: only the CLI needs it (tests import the pure function only).
    const { default: readXlsxFile } = await import('read-excel-file/node');
    const sheetRows = (await readXlsxFile(inputPath)) as unknown as unknown[][];
    return sheetRows.map((row) => row.map((cell) => cellToString(cell)));
  }
  const { default: Papa } = await import('papaparse');
  const content = readFileSync(inputPath, 'utf8');
  // Mirror the upload flow's parse options (header:false rows, empty lines
  // skipped) so the fixture matches the runtime row shape exactly.
  const result = Papa.parse<string[]>(content, { header: false, skipEmptyLines: true });
  return result.data;
}

async function main() {
  const [, , brokerArg, inputPath, outputPath] = process.argv;
  if ((brokerArg !== 'ibkr' && brokerArg !== 'revolut') || !inputPath || !outputPath) {
    console.error('Usage: npx tsx test-data/anonymize-broker-export.ts <ibkr|revolut> <input.csv|input.xlsx> <output.json>');
    process.exit(1);
  }

  const rows = await readInputRows(inputPath);
  if (rows.length === 0) {
    console.error('Input file produced no rows; nothing to anonymize.');
    process.exit(1);
  }

  const { rows: anonymized, replacements } = anonymizeBrokerRows(rows, brokerArg);
  writeFileSync(outputPath, JSON.stringify(anonymized, null, 2));

  console.log(`Anonymized ${rows.length} rows (${brokerArg}) -> ${outputPath}`);
  console.log(`  Account Information values scrubbed: ${replacements.accountInfoValues}`);
  console.log(`  Account ID occurrences replaced: ${replacements.accountIds} (${replacements.uniqueAccountIds} unique)`);
  console.log(`  Preamble cells scrubbed: ${replacements.preambleCells}`);
  console.log(`  Emails removed: ${replacements.emails}`);
  console.log(`  IBAN-shaped strings removed: ${replacements.ibans}`);
  console.log(`  Phone-shaped strings removed: ${replacements.phones}`);
  if (brokerArg === 'ibkr' && replacements.accountIds === 0 && replacements.accountInfoValues === 0) {
    console.log('  WARNING: nothing was scrubbed. Either the file was pre-trimmed or it carries');
    console.log('  PII in a shape these rules do not know. Inspect it manually before committing.');
  }
  console.log('Next: manual re-inspection is MANDATORY before commit.');
  console.log('  A person NAME inside a free-text cell (description / memo / counterparty) is');
  console.log('  NOT auto-detected by these rules. Grep the output for the customer name yourself.');
  console.log('See docs/broker-sample-intake-runbook.md (grep for the name / account number).');
}

// Only run main() when invoked as a script, not when imported by tests.
const isMainModule = process.argv[1]?.endsWith('anonymize-broker-export.ts') ||
                     process.argv[1]?.endsWith('anonymize-broker-export.js');
if (isMainModule) {
  main().catch((err) => {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
