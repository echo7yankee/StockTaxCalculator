/**
 * Parser for Trading212 Annual Statement PDF.
 *
 * Supports both English and Romanian PDF versions (Trading 212 generates
 * localized PDFs based on the user's language setting).
 *
 * Expects page texts where each line has tab-separated columns
 * (from positional text extraction).
 *
 * Sections:
 *   - Page 1: Overview (summary totals)
 *   - Page 2: Open positions
 *   - Page 3: Sell trades (with pre-computed gain/loss)
 *   - Page 4: Dividend overview (equity dividends)
 *   - Page 5: Distribution overview (ETF distributions)
 *   - Page 6: Glossary
 */

/**
 * Multilingual keyword map: each key maps to all known translations.
 * Trading 212 localizes PDF labels based on user language settings.
 * Add new languages here as needed (e.g., Bulgarian, German, etc.)
 */
const KEYWORDS = {
  // Overview labels
  closedResult: ['closed result', 'rezultat închis', 'rezultat inchis'],
  profit: ['profit'],
  loss: ['loss', 'pierdere'],
  netDividends: ['net dividends', 'dividende nete'],
  grossDividends: ['gross dividends', 'dividende brute'],
  taxWithheld: ['tax withheld', 'taxe reținute', 'taxe retinute'],
  openResult: ['open result', 'rezultat deschis'],
  accountValue: ['account value', 'valoarea contului'],

  // Section headers
  sellTrades: ['sell trades', 'closed position', 'tranzacții de vânzare', 'tranzactii de vanzare', 'poziție închisă', 'pozitie inchisa'],
  dividendOverview: ['dividend overview', 'prezentare generală a dividendelor', 'prezentare generala a dividendelor'],
  distributionOverview: ['distribution overview', 'prezentare generală a distribuțiilor', 'prezentare generala a distributiilor'],
  byInstrument: ['by instrument', 'după instrument', 'dupa instrument'],

  // Year detection
  annualStatement: ['annual statement', 'declarație anuală', 'declaratie anuala'],

  // Instrument types
  instrumentTypes: ['stock', 'etf', 'fund', 'acțiune', 'actiune'],
} as const;

/** Check if text contains any of the keyword variants (case-insensitive) */
function matchesAny(text: string, variants: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return variants.some(v => lower.includes(v));
}

export interface PdfOverview {
  closedResult: number;
  profit: number;
  loss: number;
  netDividends: number;
  grossDividends: number;
  taxWithheld: number;
  openResult: number;
  accountValue: number;
  currency: string;
}

export interface PdfSellTrade {
  executionTime: string;
  instrument: string;
  isin: string;
  instrumentType: string;
  instrumentCurrency: string;
  positionSize: number;
  averagePrice: number;
  executionPrice: number;
  fxRate: number;
  transactionCurrency: string;
  totalResult: number;
}

export interface PdfDividend {
  instrument: string;
  isin: string;
  instrumentCurrency: string;
  issuingCountry: string;
  eligibleHoldings: number;
  payDate: string;
  grossAmountPerShare: number;
  grossAmount: number;
  fxRate: number;
  grossAmountUsd: number;
  whtRate: string;
  whtUsd: number;
  netAmountUsd: number;
}

export interface PdfParseResult {
  overview: PdfOverview;
  sellTrades: PdfSellTrade[];
  dividends: PdfDividend[];
  distributions: PdfDividend[];
  year: number;
  warnings: string[];
}

function parseNum(s: string): number {
  if (!s || s === '-' || s.trim() === '' || s.trim() === '-') return 0;
  // Strip currency symbols and codes (USD, EUR, GBP, RON) + common separators
  const cleaned = s.replace(/[$€£,]/g, '').replace(/\b(USD|EUR|GBP|RON)\b/gi, '').replace(/[()]/g, '-').trim();
  return parseFloat(cleaned) || 0;
}

function detectCurrency(text: string): string {
  if (text.includes('(EUR)')) return 'EUR';
  if (text.includes('(GBP)')) return 'GBP';
  // Romanian PDFs use "RON" prefix (e.g., "RON 5.16")
  if (/\bRON\s+\d/.test(text)) return 'RON';
  if (text.includes('$')) return 'USD';
  if (text.includes('€')) return 'EUR';
  if (text.includes('£')) return 'GBP';
  return 'USD';
}

function parseOverview(text: string): PdfOverview {
  const currency = detectCurrency(text);
  const lines = text.split('\n');

  const getVal = (keyword: string): number => {
    for (const line of lines) {
      if (line.toLowerCase().includes(keyword.toLowerCase())) {
        // Find a number in the line (possibly after a tab)
        const parts = line.split('\t');
        for (let i = parts.length - 1; i >= 0; i--) {
          const n = parseNum(parts[i]);
          if (n !== 0 || parts[i].trim() === '0' || parts[i].trim() === '$0.00' || parts[i].trim() === '0.00') {
            return n;
          }
        }
      }
    }
    return 0;
  };

  /** Try multiple keyword variants, return first match */
  const getValMulti = (variants: readonly string[]): number => {
    for (const keyword of variants) {
      const val = getVal(keyword);
      if (val !== 0) return val;
    }
    // Check for explicit zero values (e.g., "Closed result 0.00")
    for (const keyword of variants) {
      for (const line of lines) {
        if (line.toLowerCase().includes(keyword.toLowerCase())) {
          const parts = line.split('\t');
          for (let i = parts.length - 1; i >= 0; i--) {
            const trimmed = parts[i].trim();
            if (trimmed === '0' || trimmed === '0.00' || /^[A-Z]{3}\s+0\.00$/.test(trimmed)) {
              return 0;
            }
          }
        }
      }
    }
    return 0;
  };

  return {
    closedResult: getValMulti(KEYWORDS.closedResult),
    profit: getValMulti(KEYWORDS.profit),
    loss: getValMulti(KEYWORDS.loss),
    netDividends: getValMulti(KEYWORDS.netDividends),
    grossDividends: getValMulti(KEYWORDS.grossDividends),
    taxWithheld: getValMulti(KEYWORDS.taxWithheld),
    openResult: getValMulti(KEYWORDS.openResult),
    accountValue: getValMulti(KEYWORDS.accountValue),
    currency,
  };
}

/**
 * Parse sell trades table.
 * Each row starts with a date DD.MM.YYYY HH:MM and has tab-separated columns:
 * EXECUTION TIME | INSTRUMENT | ISIN | TYPE | CURRENCY | SIZE | AVG PRICE | EXEC PRICE | FX RATE | TRANS CURRENCY | EXEC PRICE | TOTAL RESULT
 */
function parseSellTrades(pageTexts: string[]): PdfSellTrade[] {
  const trades: PdfSellTrade[] = [];

  for (const text of pageTexts) {
    if (!matchesAny(text, KEYWORDS.sellTrades)) continue;

    const lines = text.split('\n');
    for (const line of lines) {
      // Match lines starting with a date pattern
      if (!/^\d{2}\.\d{2}\.\d{4}/.test(line.trim())) continue;

      const cols = line.split('\t').map(c => c.trim());
      if (cols.length < 8) continue;

      // Find the ISIN column (2-letter country + alphanumeric)
      const isinIdx = cols.findIndex(c => /^[A-Z]{2}[A-Z0-9]{9,10}$/.test(c));
      if (isinIdx < 0) continue;

      const executionTime = cols.slice(0, isinIdx - 1).join(' ').trim() || cols[0];
      const instrument = cols[isinIdx - 1] || cols[1] || '';
      const isin = cols[isinIdx];

      // After ISIN: type, currency, then numeric fields
      const afterIsin = cols.slice(isinIdx + 1);

      // Extract non-numeric fields first (type, currency, transaction currency)
      const instrumentTypePattern = /^(Stock|ETF|Fund|Acțiune|Actiune)$/i;
      const instrumentType = afterIsin.find(c => instrumentTypePattern.test(c)) || 'Stock';
      const currencies = afterIsin.filter(c => /^(USD|EUR|GBP|RON)$/i.test(c));
      const instrumentCurrency = currencies[0] || 'USD';
      const transactionCurrency = currencies[1] || currencies[0] || 'USD';

      // Extract all numeric values
      const numericValues = afterIsin
        .filter(c => !instrumentTypePattern.test(c) && !/^(USD|EUR|GBP|RON)$/i.test(c))
        .map(c => parseNum(c))
        .filter(n => !isNaN(n));

      if (numericValues.length < 4) continue;

      // Numeric fields order: positionSize, averagePrice, executionPrice, fxRate, executionPrice2, totalResult
      // The last value is always totalResult
      const totalResult = numericValues[numericValues.length - 1];
      const positionSize = numericValues[0];
      const averagePrice = numericValues[1];
      const executionPrice = numericValues[2];
      const fxRate = numericValues.length >= 5 ? numericValues[3] : 1;

      trades.push({
        executionTime,
        instrument,
        isin,
        instrumentType,
        instrumentCurrency,
        positionSize,
        averagePrice,
        executionPrice,
        fxRate,
        transactionCurrency,
        totalResult,
      });
    }
  }

  return trades;
}

/**
 * Parse dividend/distribution table rows.
 * Each row contains an ISIN and has tab-separated columns.
 */
function parseDividendRows(pageTexts: string[], sectionKeywords: readonly string[]): PdfDividend[] {
  const dividends: PdfDividend[] = [];

  for (const text of pageTexts) {
    if (!matchesAny(text, sectionKeywords)) continue;

    // Find the "by instrument" section (EN: "by instrument", RO: "după instrument")
    let byInstrumentIdx = -1;
    for (const variant of KEYWORDS.byInstrument) {
      const idx = text.toLowerCase().indexOf(variant);
      if (idx >= 0) { byInstrumentIdx = idx; break; }
    }
    if (byInstrumentIdx < 0) continue;

    const sectionText = text.substring(byInstrumentIdx);
    const lines = sectionText.split('\n');

    for (const line of lines) {
      const cols = line.split('\t').map(c => c.trim());
      if (cols.length < 8) continue;

      // Find ISIN column
      const isinIdx = cols.findIndex(c => /^[A-Z]{2}[A-Z0-9]{9,10}$/.test(c));
      if (isinIdx < 0) continue;

      // Skip header lines
      if (cols.some(c => c === 'INSTRUMENT' || c === 'ISIN')) continue;

      const instrument = cols.slice(0, isinIdx).join(' ').trim();
      const isin = cols[isinIdx];

      // Columns after ISIN follow a fixed layout:
      // CURRENCY | COUNTRY | HOLDINGS | PAY DATE | GROSS/SHARE | GROSS | FX RATE | GROSS(USD) | WHT RATE | WHT(USD) | NET(USD)
      const afterIsin = cols.slice(isinIdx + 1);

      const instrumentCurrency = afterIsin.find(c => /^(USD|EUR|GBP|RON)$/i.test(c)) || 'USD';
      const country = afterIsin.find(c => /^[A-Z]{2}$/.test(c) && !/^(USD|EUR|GBP|RON)$/i.test(c)) || '';
      const payDate = afterIsin.find(c => /^\d{2}\.\d{2}\.\d{4}/.test(c)) || '';
      const whtRateCol = afterIsin.find(c => c.includes('%')) || '-';

      // Use positional parsing: from the end, columns are NET | WHT(USD) | WHT RATE | GROSS(USD) | FX RATE | GROSS | GROSS/SHARE | PAY DATE | HOLDINGS | COUNTRY | CURRENCY
      // Work from end backwards for reliability
      const lastIdx = afterIsin.length - 1;
      const netAmountUsd = parseNum(afterIsin[lastIdx] || '0');
      const whtUsd = parseNum(afterIsin[lastIdx - 1] || '0');
      // whtRate is at lastIdx - 2 (already captured above)
      const grossAmountUsd = parseNum(afterIsin[lastIdx - 3] || '0');
      const fxRate = parseNum(afterIsin[lastIdx - 4] || '1') || 1;
      const grossAmount = parseNum(afterIsin[lastIdx - 5] || '0');
      const grossPerShare = parseNum(afterIsin[lastIdx - 6] || '0');

      // eligibleHoldings: find first numeric value after currency/country
      const holdingsIdx = afterIsin.findIndex(c => {
        const n = parseFloat(c.replace(/,/g, ''));
        return !isNaN(n) && !/^[A-Z]{2,3}$/i.test(c);
      });
      const eligibleHoldings = holdingsIdx >= 0 ? parseNum(afterIsin[holdingsIdx]) : 0;

      if (grossAmountUsd === 0 && grossAmount === 0) continue;

      dividends.push({
        instrument,
        isin,
        instrumentCurrency,
        issuingCountry: country,
        eligibleHoldings,
        payDate,
        grossAmountPerShare: grossPerShare,
        grossAmount,
        fxRate,
        grossAmountUsd: grossAmountUsd || grossAmount,
        whtRate: whtRateCol,
        whtUsd,
        netAmountUsd: netAmountUsd || grossAmountUsd,
      });
    }
  }

  return dividends;
}

function detectYear(text: string): { year: number; fallback: boolean } {
  // EN: "Annual Statement - 2025", RO: "Declarație anuală - 2025"
  const match = text.match(/(?:Annual Statement|Declarație anuală|Declaratie anuala)\s*[-–]\s*(\d{4})/i);
  if (match) return { year: parseInt(match[1]), fallback: false };

  // Look for date range pattern (EN: "to", RO uses " - " between dates)
  const rangeMatch = text.match(/(\d{2}\.\d{2}\.\d{4}).*?(?:to|-|–)\s*(\d{2}\.\d{2}\.\d{4})/i);
  if (rangeMatch) {
    return { year: parseInt(rangeMatch[2].split('.')[2]), fallback: false };
  }

  return { year: new Date().getFullYear() - 1, fallback: true };
}

/**
 * Main entry point: parse extracted PDF page texts into structured data.
 * @param pageTexts Array of text strings, one per PDF page (tab-separated columns per line)
 */
export function parseTrading212AnnualStatement(pageTexts: string[]): PdfParseResult {
  const fullText = pageTexts.join('\n');
  const warnings: string[] = [];

  const { year, fallback: yearFallback } = detectYear(fullText);
  if (yearFallback) {
    warnings.push(`Could not detect year from PDF. Defaulting to ${year}.`);
  }
  const overview = parseOverview(pageTexts[0] ?? fullText);
  const sellTrades = parseSellTrades(pageTexts);
  const dividends = parseDividendRows(pageTexts, KEYWORDS.dividendOverview);
  const distributions = parseDividendRows(pageTexts, KEYWORDS.distributionOverview);

  if (sellTrades.length === 0) {
    if (matchesAny(fullText, KEYWORDS.sellTrades)) {
      warnings.push('Sell trades section found but no rows could be parsed. The PDF format may differ from expected.');
    } else {
      warnings.push('No sell trades section found in the PDF.');
    }
  }

  if (dividends.length === 0 && matchesAny(fullText, KEYWORDS.dividendOverview)) {
    warnings.push('Dividend section found but no rows could be parsed.');
  }

  // Cross-check: compare parsed sell total with overview
  if (sellTrades.length > 0 && overview.closedResult > 0) {
    const parsedTotal = sellTrades.reduce((s, t) => s + t.totalResult, 0);
    const diff = Math.abs(parsedTotal - overview.closedResult);
    if (diff > 1) {
      warnings.push(
        `Parsed sell trades total (${parsedTotal.toFixed(2)}) differs from overview (${overview.closedResult.toFixed(2)}). Some rows may not have been parsed.`
      );
    }
  }

  return { overview, sellTrades, dividends, distributions, year, warnings };
}
