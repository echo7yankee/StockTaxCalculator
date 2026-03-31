/**
 * Parser for Trading212 Annual Statement PDF.
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
  const cleaned = s.replace(/[$€£,]/g, '').replace(/[()]/g, '-').trim();
  return parseFloat(cleaned) || 0;
}

function detectCurrency(text: string): string {
  if (text.includes('(EUR)')) return 'EUR';
  if (text.includes('(GBP)')) return 'GBP';
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

  return {
    closedResult: getVal('Closed result'),
    profit: getVal('Profit'),
    loss: getVal('Loss'),
    netDividends: getVal('Net Dividends'),
    grossDividends: getVal('Gross Dividends'),
    taxWithheld: getVal('Tax Withheld'),
    openResult: getVal('Open result'),
    accountValue: getVal('Account value'),
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
    const lower = text.toLowerCase();
    if (!lower.includes('sell trades') && !lower.includes('closed position')) continue;

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
      let afterIsin = cols.slice(isinIdx + 1);

      // Extract non-numeric fields first (type, currency, transaction currency)
      const instrumentType = afterIsin.find(c => /^(Stock|ETF|Fund)$/i.test(c)) || 'Stock';
      const currencies = afterIsin.filter(c => /^(USD|EUR|GBP|RON)$/i.test(c));
      const instrumentCurrency = currencies[0] || 'USD';
      const transactionCurrency = currencies[1] || currencies[0] || 'USD';

      // Extract all numeric values
      const numericValues = afterIsin
        .filter(c => !/^(Stock|ETF|Fund|USD|EUR|GBP|RON)$/i.test(c))
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
function parseDividendRows(pageTexts: string[], sectionKeyword: string): PdfDividend[] {
  const dividends: PdfDividend[] = [];

  for (const text of pageTexts) {
    if (!text.toLowerCase().includes(sectionKeyword)) continue;

    // Find the "by instrument" section
    const byInstrumentIdx = text.toLowerCase().indexOf('by instrument');
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

      const afterIsin = cols.slice(isinIdx + 1);

      // Extract currencies and country
      const currencies = afterIsin.filter(c => /^(USD|EUR|GBP|RON)$/i.test(c));
      const country = afterIsin.find(c => /^[A-Z]{2}$/.test(c) && !/^(USD|EUR|GBP|RON)$/i.test(c)) || '';
      const instrumentCurrency = currencies[0] || 'USD';

      // Find date field
      const dateCol = afterIsin.find(c => /^\d{2}\.\d{2}\.\d{4}/.test(c));
      const payDate = dateCol || '';

      // Get all numeric values
      const numericCols = afterIsin
        .filter(c => !/^(USD|EUR|GBP|RON|[A-Z]{2})$/i.test(c))
        .filter(c => !/^\d{2}\.\d{2}\.\d{4}/.test(c))
        .filter(c => c !== '-' && c !== '');

      const nums = numericCols.map(c => parseNum(c));

      // Expected order: eligibleHoldings, (time), grossPerShare, grossAmount, fxRate, grossAmountUsd, (whtRate%), whtUsd, netUsd
      // Filter out time-like values
      const timeIdx = afterIsin.findIndex(c => /^\d{2}:\d{2}$/.test(c));
      const numericValues = nums.filter(n => !isNaN(n));

      if (numericValues.length < 4) continue;

      // The last value is net amount, second to last is WHT
      const netAmountUsd = numericValues[numericValues.length - 1];
      const whtUsd = numericValues.length > 5 ? numericValues[numericValues.length - 2] : 0;
      const whtRateCol = afterIsin.find(c => c.includes('%')) || '-';

      // First numeric is eligible holdings, then gross per share, gross, fx rate, gross USD
      const eligibleHoldings = numericValues[0] || 0;
      const grossPerShare = numericValues.length > 4 ? numericValues[1] : 0;
      const grossAmount = numericValues.length > 4 ? numericValues[2] : numericValues[1] || 0;
      const fxRate = numericValues.length > 5 ? numericValues[3] : 1;
      const grossAmountUsd = numericValues.length > 5 ? numericValues[4] : grossAmount;

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
        grossAmountUsd,
        whtRate: whtRateCol,
        whtUsd,
        netAmountUsd: netAmountUsd || grossAmountUsd,
      });
    }
  }

  return dividends;
}

function detectYear(text: string): number {
  const match = text.match(/Annual Statement\s*[-–]\s*(\d{4})/i);
  if (match) return parseInt(match[1]);

  // Look for date range pattern
  const rangeMatch = text.match(/(\d{2}\.\d{2}\.\d{4}).*?to.*?(\d{2}\.\d{2}\.\d{4})/i);
  if (rangeMatch) {
    return parseInt(rangeMatch[2].split('.')[2]);
  }

  return new Date().getFullYear() - 1;
}

/**
 * Main entry point: parse extracted PDF page texts into structured data.
 * @param pageTexts Array of text strings, one per PDF page (tab-separated columns per line)
 */
export function parseTrading212AnnualStatement(pageTexts: string[]): PdfParseResult {
  const fullText = pageTexts.join('\n');
  const warnings: string[] = [];

  const year = detectYear(fullText);
  const overview = parseOverview(pageTexts[0] ?? fullText);
  const sellTrades = parseSellTrades(pageTexts);
  const dividends = parseDividendRows(pageTexts, 'dividend overview');
  const distributions = parseDividendRows(pageTexts, 'distribution overview');

  if (sellTrades.length === 0) {
    if (fullText.toLowerCase().includes('sell trades')) {
      warnings.push('Sell trades section found but no rows could be parsed. The PDF format may differ from expected.');
    } else {
      warnings.push('No sell trades section found in the PDF.');
    }
  }

  if (dividends.length === 0 && fullText.toLowerCase().includes('dividend overview')) {
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
