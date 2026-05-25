/**
 * Parameterized synthetic Trading 212 annual-statement PDF page generator.
 *
 * Emits a string[] mirroring what `extract-fixture.ts` produces from a real T212
 * PDF: one tab-separated text block per logical page, in the same shape the
 * parser at `shared/src/parsers/trading212Pdf.ts` consumes.
 *
 * Goal: cover the T212 PDF parameter space (account count, account types,
 * language, base currency, year, trade/dividend/distribution counts, ligature
 * artifacts, corporate actions) so PR A.2 can sweep the parser + engine over
 * the cartesian product and surface format-drift regressions before customers
 * hit them.
 *
 * Currently fully localized for `en` and `ro`. `pl` / `es` / `it` are accepted
 * in the type for future expansion; today they emit English labels with a
 * language-marker comment in the title line. Round-trip tests assert the
 * en + ro variants parse cleanly through `parseTrading212AnnualStatement`.
 *
 * NOT covered (deliberately scoped out of A.1):
 *   - Multi-page section continuation (sell-trades / dividends spanning >1
 *     page). Parser supports it; generator emits each section on one logical
 *     page so far. Real customers can produce 14-page statements; we cover
 *     that via real-fixture growth (sub-PR B) and via A.2's volume params.
 *   - PDF binary output. We emit page-text strings, the same shape PDF.js
 *     extraction produces. The full PDF roundtrip is out of scope; this stays
 *     at the parser-input boundary.
 *   - Open-positions page (page 2 in the real Dragos fixture). Parser ignores
 *     it. Skipped to keep the generator surface minimal.
 */

export type T212AccountType = 'Invest' | 'ISA' | 'CFD' | 'Crypto' | 'Pension';
export type T212Currency = 'USD' | 'EUR' | 'GBP' | 'RON';
export type T212Language = 'en' | 'ro' | 'pl' | 'es' | 'it';
export type T212CorporateAction = 'split' | 'reinvest' | 'name-change';

export interface T212SynthSpec {
  /** Account sections to emit on the overview page. First account is always Invest in the real T212 PDFs; we enforce that ordering. Length 1-3. */
  accounts: T212AccountType[];
  /** Base currency for overview totals. Sell trades / dividends may use a different instrumentCurrency. */
  baseCurrency: T212Currency;
  /** PDF language. en + ro fully localized today. */
  language: T212Language;
  /** Tax year (used in the title and in trade execution dates). */
  year: number;
  /** Number of sell trades to emit. 0 produces a section-with-no-rows is NOT emitted (parser would warn "no section found"); use sellTradeCount >= 1 to get a clean section. */
  sellTradeCount: number;
  /** Number of equity dividends to emit. */
  dividendCount: number;
  /** Number of ETF distributions to emit. */
  distributionCount: number;
  /** When true, replaces "Profit" / "confirmations" / similar ligature-prone words with their tab-broken variants ("Pro\tfi\tt", "con\tfi\trmations"). Real PDF.js output exhibits this for some T212 PDFs. */
  ligatureBroken: boolean;
  /** Corporate-action events to embed in the sell trades (e.g. stock split notes). Currently structural only; reserved for richer narrative in A.2 sweeps. */
  corporateActions: T212CorporateAction[];
  /** Customer name to embed in the header. The anonymization tool replaces this; we accept it here so fixtures can use a known synthetic identity. */
  customerName: string;
  /** Customer ID. Should be the anonymized "99999999" placeholder unless you specifically want a different synthetic ID. */
  customerId?: string;
}

interface LanguageStrings {
  customerIdHeader: string;
  customerNameHeader: string;
  annualStatementTitle: (year: number) => string;
  overviewSection: string;
  closedResult: string;
  profit: string;
  loss: string;
  netDividends: string;
  grossDividends: string;
  taxWithheld: string;
  openResult: string;
  accountValue: string;
  accountIdLabel: string;
  sellTradesHeading: string;
  sellTradesIntro: (year: number) => string;
  sellTradesColumns: string;
  dividendOverviewHeading: string;
  dividendOverviewIntro: (year: number) => string;
  distributionOverviewHeading: string;
  distributionOverviewIntro: (year: number) => string;
  byInstrument: string;
  dividendColumnsLine1: string;
  dividendColumnsLine2: string;
  instrumentTypeStock: string;
  instrumentTypeEtf: string;
  glossaryHeading: string;
  footerLegal: string;
  pageMarker: (current: number, total: number) => string;
}

const STRINGS_EN: LanguageStrings = {
  customerIdHeader: 'CUSTOMER ID',
  customerNameHeader: 'CUSTOMER NAME',
  annualStatementTitle: (y) => `Annual Statement - ${y}`,
  overviewSection: 'Overview',
  closedResult: 'Closed result',
  profit: 'Profit',
  loss: 'Loss',
  netDividends: 'Net Dividends',
  grossDividends: 'Gross Dividends',
  taxWithheld: 'Tax Withheld',
  openResult: 'Open result',
  accountValue: 'Account value',
  accountIdLabel: 'Account ID:',
  sellTradesHeading: 'Invest account - sell trades',
  sellTradesIntro: (y) => `A list of all sell trades in your Invest account in ${y}.`,
  sellTradesColumns: 'EXECUTION TIME\tINSTRUMENT\tISIN\tINSTRUMENT TYPE\tCURRENCY\tPOSITION SIZE\tAVERAGE PRICE\tEXECUTION PRICE\tFX RATE\tTRANSACTION CURRENCY\tEXECUTION PRICE\tTOTAL RESULT',
  dividendOverviewHeading: 'Invest account - dividend overview',
  dividendOverviewIntro: (y) => `A list of all equity dividends received in your Invest account in ${y}.`,
  distributionOverviewHeading: 'Invest account - distribution overview',
  distributionOverviewIntro: (y) => `A list of all ETF distributions received in your Invest account in ${y}.`,
  byInstrument: 'By instrument',
  dividendColumnsLine1: 'INSTRUMENT\tELIGIBLE\tGROSS AMOUNT PER\tGROSS\tGROSS AMOUNT\tWHT\tNET AMOUNT',
  dividendColumnsLine2: 'INSTRUMENT\tISIN\tCURRENCY\tISSUING COUNTRY\tHOLDINGS\tPAY DATE\tSHARE\tAMOUNT\tFX RATE\t(USD)\tWHT RATE\t(USD)\t(USD)',
  instrumentTypeStock: 'Stock',
  instrumentTypeEtf: 'ETF',
  glossaryHeading: 'Glossary',
  footerLegal: "This document does not constitute tax advice. Trading 212 UK Ltd. is registered in England and Wales.",
  pageMarker: (c, t) => `${c}/${t}`,
};

const STRINGS_RO: LanguageStrings = {
  customerIdHeader: 'ID CLIENT',
  customerNameHeader: 'NUME CLIENT',
  annualStatementTitle: (y) => `Declarație anuală - ${y}`,
  overviewSection: 'Prezentare generală',
  closedResult: 'Rezultat închis',
  profit: 'Profit',
  loss: 'Pierdere',
  netDividends: 'Dividende nete',
  grossDividends: 'Dividende brute',
  taxWithheld: 'Taxe reținute',
  openResult: 'Rezultat deschis',
  accountValue: 'Valoarea contului',
  accountIdLabel: 'Cont nr.:',
  sellTradesHeading: 'Tranzacții de vânzare - poziție închisă',
  sellTradesIntro: (y) => `O listă a tuturor pozițiilor închise din contul tău Invest în ${y}.`,
  sellTradesColumns: 'DATA EXECUȚIE\tINSTRUMENT\tISIN\tTIP\tMONEDĂ\tDIMENSIUNEA POZIȚIEI\tPREȚ MEDIU\tPREȚ EXECUȚIE\tCURS\tMONEDĂ TRANZACȚIE\tPREȚ EXECUȚIE\tREZULTAT TOTAL',
  dividendOverviewHeading: 'Cont Invest - Prezentare generală a dividendelor',
  dividendOverviewIntro: (y) => `O listă a dividendelor primite în ${y}.`,
  distributionOverviewHeading: 'Cont Invest - Prezentare generală a distribuțiilor',
  distributionOverviewIntro: (y) => `O listă a distribuțiilor ETF primite în ${y}.`,
  byInstrument: 'După instrument',
  dividendColumnsLine1: 'INSTRUMENT\tELIGIBLE\tGROSS PER\tGROSS\tGROSS\tWHT\tNET',
  dividendColumnsLine2: 'INSTRUMENT\tISIN\tMONEDĂ\tȚARĂ\tACȚIUNI ELIGIBILE\tDATA PLĂȚII\tBRUT/ACȚIUNE\tBRUT\tCURS\tBRUT (RON)\tRATĂ TAXĂ\tTAXĂ (RON)\tNET (RON)',
  instrumentTypeStock: 'Acțiune',
  instrumentTypeEtf: 'ETF',
  glossaryHeading: 'Glosar',
  footerLegal: 'Acest document nu constituie consultanță fiscală. Trading 212 Markets Ltd. este înregistrată în Republica Cipru.',
  pageMarker: (c, t) => `${c}/${t}`,
};

function stringsFor(language: T212Language): LanguageStrings {
  if (language === 'ro') return STRINGS_RO;
  // pl/es/it placeholder: emit English structure with a language marker in the title.
  return STRINGS_EN;
}

const CURRENCY_PREFIX: Record<T212Currency, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  RON: 'RON ',
};

function formatMoney(amount: number, currency: T212Currency): string {
  const prefix = CURRENCY_PREFIX[currency];
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  // T212 PDFs use US-style "1,234.56" formatting in both en and ro variants.
  const body = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === 'RON') {
    return `${prefix}${sign}${body}`;
  }
  return `${sign}${prefix}${body}`;
}

function applyLigatureBreaks(text: string): string {
  // T212 PDFs occasionally render the "fi" ligature as a glyph that PDF.js
  // splits across tab stops, so "profit" comes back as "Pro\tfi\tt". The
  // parser tolerates this; we exercise it from the generator side here.
  return text
    .replace(/\bProfit\b/g, 'Pro\tfi\tt')
    .replace(/\bprofit\b/g, 'pro\tfi\tt')
    .replace(/\bconfirmations\b/g, 'con\tfi\trmations')
    .replace(/\bfill\b/g, '\tfi\tll')
    .replace(/\bspecific\b/g, 'speci\tfi\tc');
}

interface SynthSellTrade {
  date: string;
  instrument: string;
  isin: string;
  instrumentType: 'Stock' | 'ETF';
  currency: T212Currency;
  size: number;
  avgPrice: number;
  execPrice: number;
  fxRate: number;
  totalResult: number;
}

interface SynthDividend {
  instrument: string;
  isin: string;
  currency: T212Currency;
  country: string;
  holdings: number;
  payDate: string;
  grossPerShare: number;
  grossAmount: number;
  fxRate: number;
  grossUsd: number;
  whtRate: string;
  whtUsd: number;
  netUsd: number;
}

const INSTRUMENT_CATALOG: Array<{ name: string; isin: string; country: string; type: 'Stock' | 'ETF' }> = [
  { name: 'Apple Inc.', isin: 'US0378331005', country: 'US', type: 'Stock' },
  { name: 'Microsoft Corp.', isin: 'US5949181045', country: 'US', type: 'Stock' },
  { name: 'Nvidia', isin: 'US67066G1040', country: 'US', type: 'Stock' },
  { name: 'Alphabet (Class A)', isin: 'US02079K3059', country: 'US', type: 'Stock' },
  { name: 'Meta Platforms', isin: 'US30303M1027', country: 'US', type: 'Stock' },
  { name: 'Palantir', isin: 'US69608A1088', country: 'US', type: 'Stock' },
  { name: 'Tesla', isin: 'US88160R1014', country: 'US', type: 'Stock' },
  { name: 'Advanced Micro Devices', isin: 'US0079031078', country: 'US', type: 'Stock' },
  { name: 'PayPal', isin: 'US70450Y1038', country: 'US', type: 'Stock' },
  { name: 'SoFi Technologies', isin: 'US83406F1021', country: 'US', type: 'Stock' },
  { name: 'Hidroelectrica', isin: 'ROHIELACNOR9', country: 'RO', type: 'Stock' },
  { name: 'Banca Transilvania', isin: 'ROTLVAACNOR1', country: 'RO', type: 'Stock' },
  { name: 'Vanguard S&P 500 (Dist)', isin: 'IE00B3XXRP09', country: 'IE', type: 'ETF' },
  { name: 'iShares Core MSCI World', isin: 'IE00B4L5Y983', country: 'IE', type: 'ETF' },
];

function pickInstrument(idx: number, preferType?: 'Stock' | 'ETF'): typeof INSTRUMENT_CATALOG[number] {
  if (preferType === 'ETF') {
    const etfs = INSTRUMENT_CATALOG.filter(i => i.type === 'ETF');
    return etfs[idx % etfs.length];
  }
  if (preferType === 'Stock') {
    const stocks = INSTRUMENT_CATALOG.filter(i => i.type === 'Stock');
    return stocks[idx % stocks.length];
  }
  return INSTRUMENT_CATALOG[idx % INSTRUMENT_CATALOG.length];
}

function synthSellTrades(spec: T212SynthSpec): SynthSellTrade[] {
  const trades: SynthSellTrade[] = [];
  for (let i = 0; i < spec.sellTradeCount; i++) {
    const inst = pickInstrument(i, 'Stock');
    const month = ((i % 12) + 1).toString().padStart(2, '0');
    const day = ((i % 28) + 1).toString().padStart(2, '0');
    const hour = ((9 + (i % 8)) % 24).toString().padStart(2, '0');
    const minute = ((i * 7) % 60).toString().padStart(2, '0');
    const date = `${day}.${month}.${spec.year} ${hour}:${minute}`;
    const size = 10 + (i % 90);
    const avgPrice = 50 + (i * 3.7) % 200;
    const execPrice = avgPrice * (1 + ((i % 5 === 0) ? -0.1 : 0.15));
    const totalResult = (execPrice - avgPrice) * size;
    const currency: T212Currency = inst.country === 'RO' ? 'RON' : inst.country === 'IE' ? 'EUR' : 'USD';
    const fxRate = currency === spec.baseCurrency ? 1 : currency === 'RON' && spec.baseCurrency === 'USD' ? 0.22 : 1.05;
    trades.push({
      date,
      instrument: inst.name,
      isin: inst.isin,
      instrumentType: inst.type,
      currency,
      size,
      avgPrice,
      execPrice,
      fxRate,
      totalResult,
    });
  }
  return trades;
}

function synthDividends(spec: T212SynthSpec, kind: 'dividend' | 'distribution'): SynthDividend[] {
  const out: SynthDividend[] = [];
  const count = kind === 'dividend' ? spec.dividendCount : spec.distributionCount;
  const preferType = kind === 'distribution' ? 'ETF' : 'Stock';
  for (let i = 0; i < count; i++) {
    const inst = pickInstrument(i + (kind === 'distribution' ? 100 : 0), preferType);
    const month = ((i % 12) + 1).toString().padStart(2, '0');
    const day = ((i % 28) + 1).toString().padStart(2, '0');
    const payDate = `${day}.${month}.${spec.year} 16:30`;
    const holdings = 25 + (i * 3.5);
    const grossPerShare = 0.2 + (i * 0.05);
    const grossAmount = +(holdings * grossPerShare).toFixed(2);
    const currency: T212Currency = inst.country === 'RO' ? 'RON' : inst.country === 'IE' ? 'EUR' : 'USD';
    const fxRate = currency === spec.baseCurrency ? 1 : 1.0;
    const grossUsd = +(grossAmount * fxRate).toFixed(2);
    const whtRate = kind === 'distribution' ? '-' : '10%';
    const whtUsd = kind === 'distribution' ? 0 : +(grossUsd * 0.1).toFixed(2);
    const netUsd = +(grossUsd - whtUsd).toFixed(2);
    out.push({
      instrument: inst.name,
      isin: inst.isin,
      currency,
      country: inst.country,
      holdings,
      payDate,
      grossPerShare,
      grossAmount,
      fxRate,
      grossUsd,
      whtRate,
      whtUsd,
      netUsd,
    });
  }
  return out;
}

function buildOverviewPage(spec: T212SynthSpec, totals: {
  closedResult: number;
  profit: number;
  loss: number;
  grossDividends: number;
  netDividends: number;
  taxWithheld: number;
}): string {
  const s = stringsFor(spec.language);
  const lines: string[] = [];
  const customerId = spec.customerId ?? '99999999';

  lines.push(`${s.customerIdHeader}\t${s.customerNameHeader}`);
  lines.push(`${customerId}\t${spec.customerName}`);
  lines.push(s.annualStatementTitle(spec.year));
  lines.push(s.overviewSection);

  if (spec.accounts.length === 1) {
    // Single account: vertical list of labels and values.
    lines.push(`Trading 212 ${spec.accounts[0]}`);
    lines.push(`${s.accountIdLabel} 11111`);
    lines.push(`${s.closedResult}\t${formatMoney(totals.closedResult, spec.baseCurrency)}`);
    lines.push(`${s.profit}\t${formatMoney(totals.profit, spec.baseCurrency)}`);
    lines.push(`${s.loss}\t${formatMoney(-totals.loss, spec.baseCurrency)}`);
    lines.push(`${s.netDividends}\t${formatMoney(totals.netDividends, spec.baseCurrency)}`);
    lines.push(`${s.grossDividends}\t${formatMoney(totals.grossDividends, spec.baseCurrency)}`);
    lines.push(`${s.taxWithheld}\t${formatMoney(totals.taxWithheld, spec.baseCurrency)}`);
    lines.push(`${s.openResult}\t${formatMoney(0, spec.baseCurrency)}`);
    lines.push(`${s.accountValue}\t${formatMoney(totals.closedResult + totals.netDividends, spec.baseCurrency)}`);
  } else {
    // Multi-account: horizontal columns. Invest is always leftmost (the parser
    // depends on that ordering for its Pass-1 line-start logic). Each metric
    // row is "InvestLabel\tInvestVal\tSiblingLabel\tSiblingVal\t..." with
    // siblings (CFD/Crypto) carrying only the metrics they actually have.
    const accountHeader = spec.accounts.map(a => `Trading 212 ${a}`).join('\t');
    lines.push(accountHeader);
    lines.push(spec.accounts.map((_, i) => `${s.accountIdLabel} ${String(i + 1).repeat(5)}`).join('\t'));

    const closedRow = spec.accounts
      .map((_a, i) => {
        const val = i === 0 ? totals.closedResult : 0;
        return `${s.closedResult}\t${formatMoney(val, spec.baseCurrency)}`;
      })
      .join('\t');
    lines.push(closedRow);

    // Invest-only rows (CFD/Crypto don't have Net/Gross dividends or tax withheld).
    lines.push(`${s.netDividends}\t${formatMoney(totals.netDividends, spec.baseCurrency)}`);
    lines.push(`${s.grossDividends}\t${formatMoney(totals.grossDividends, spec.baseCurrency)}`);
    lines.push(`${s.taxWithheld}\t${formatMoney(totals.taxWithheld, spec.baseCurrency)}`);
    lines.push(`${s.openResult}\t${formatMoney(0, spec.baseCurrency)}`);
    lines.push(`${s.accountValue}\t${formatMoney(totals.closedResult + totals.netDividends, spec.baseCurrency)}`);
  }

  return lines.join('\n');
}

function buildSellTradesPage(spec: T212SynthSpec, trades: SynthSellTrade[]): string {
  const s = stringsFor(spec.language);
  const lines: string[] = [];
  const customerId = spec.customerId ?? '99999999';
  lines.push(`${s.customerIdHeader}\t${s.customerNameHeader}`);
  lines.push(`${customerId}\t${spec.customerName}`);
  lines.push(s.sellTradesHeading);
  lines.push(s.sellTradesIntro(spec.year));
  lines.push('INSTRUMENT');
  lines.push(s.sellTradesColumns);

  for (const t of trades) {
    const typeLabel = t.instrumentType === 'Stock' ? s.instrumentTypeStock : s.instrumentTypeEtf;
    const cols = [
      t.date,
      t.instrument,
      t.isin,
      typeLabel,
      t.currency,
      t.size.toString(),
      t.avgPrice.toFixed(2),
      t.execPrice.toFixed(2),
      t.fxRate.toFixed(4),
      t.currency,
      t.execPrice.toFixed(2),
      t.totalResult.toFixed(2),
    ];
    lines.push(cols.join('\t'));
  }

  return lines.join('\n');
}

function buildDividendPage(
  spec: T212SynthSpec,
  divs: SynthDividend[],
  kind: 'dividend' | 'distribution',
): string {
  const s = stringsFor(spec.language);
  const lines: string[] = [];
  const customerId = spec.customerId ?? '99999999';
  lines.push(`${s.customerIdHeader}\t${s.customerNameHeader}`);
  lines.push(`${customerId}\t${spec.customerName}`);
  lines.push(kind === 'dividend' ? s.dividendOverviewHeading : s.distributionOverviewHeading);
  lines.push(kind === 'dividend' ? s.dividendOverviewIntro(spec.year) : s.distributionOverviewIntro(spec.year));
  lines.push(s.byInstrument);
  lines.push(s.dividendColumnsLine1);
  lines.push(s.dividendColumnsLine2);

  for (const d of divs) {
    const cols = [
      d.instrument,
      d.isin,
      d.currency,
      d.country,
      d.holdings.toFixed(holdingsDecimals(d.holdings)),
      d.payDate,
      d.grossPerShare.toFixed(4),
      d.grossAmount.toFixed(2),
      d.fxRate.toFixed(4),
      d.grossUsd.toFixed(2),
      d.whtRate,
      d.whtUsd === 0 && d.whtRate === '-' ? '-' : d.whtUsd.toFixed(2),
      d.netUsd.toFixed(2),
    ];
    lines.push(cols.join('\t'));
  }

  return lines.join('\n');
}

function holdingsDecimals(holdings: number): number {
  return Number.isInteger(holdings) ? 0 : 4;
}

function buildGlossaryPage(spec: T212SynthSpec): string {
  const s = stringsFor(spec.language);
  // Kept intentionally short and free of `KEYWORDS.sellTrades` / `KEYWORDS.dividendOverview`
  // phrases (e.g. "closed position", "dividend overview") so the glossary
  // doesn't accidentally re-trigger section-detection warnings on the parser.
  return [
    `${s.customerIdHeader}\t${s.customerNameHeader}`,
    `${spec.customerId ?? '99999999'}\t${spec.customerName}`,
    s.glossaryHeading,
    'Definitions of key terms used throughout this statement.',
  ].join('\n');
}

function appendFooter(pageBody: string, spec: T212SynthSpec, current: number, total: number): string {
  const s = stringsFor(spec.language);
  const footer = `${s.footerLegal}\t${s.pageMarker(current, total)}`;
  return `${pageBody}\n${footer}`;
}

/**
 * Generate a T212 annual-statement PDF page-text array for the given spec.
 *
 * Returned array shape:
 *   pages[0] = Overview (always)
 *   pages[1] = Sell trades (if sellTradeCount > 0)
 *   pages[2] = Dividend overview (if dividendCount > 0)
 *   pages[3] = Distribution overview (if distributionCount > 0)
 *   pages[last] = Glossary
 *
 * Sections with zero rows are omitted entirely. The parser warns "no section
 * found" for those, which is the correct behavior; we don't synthesize empty
 * sections.
 */
export function synthesizeT212Pages(spec: T212SynthSpec): string[] {
  validateSpec(spec);

  const trades = synthSellTrades(spec);
  const dividends = synthDividends(spec, 'dividend');
  const distributions = synthDividends(spec, 'distribution');

  const closedResult = trades.reduce((sum, t) => sum + t.totalResult, 0);
  const profit = trades.filter(t => t.totalResult > 0).reduce((sum, t) => sum + t.totalResult, 0);
  const loss = trades.filter(t => t.totalResult < 0).reduce((sum, t) => sum + Math.abs(t.totalResult), 0);
  const grossDividends = dividends.reduce((sum, d) => sum + d.grossUsd, 0)
    + distributions.reduce((sum, d) => sum + d.grossUsd, 0);
  const taxWithheld = dividends.reduce((sum, d) => sum + d.whtUsd, 0)
    + distributions.reduce((sum, d) => sum + d.whtUsd, 0);
  const netDividends = grossDividends - taxWithheld;

  const totals = { closedResult, profit, loss, grossDividends, netDividends, taxWithheld };

  const pages: string[] = [];
  pages.push(buildOverviewPage(spec, totals));
  if (spec.sellTradeCount > 0) pages.push(buildSellTradesPage(spec, trades));
  if (spec.dividendCount > 0) pages.push(buildDividendPage(spec, dividends, 'dividend'));
  if (spec.distributionCount > 0) pages.push(buildDividendPage(spec, distributions, 'distribution'));
  pages.push(buildGlossaryPage(spec));

  const totalPages = pages.length;
  const withFooters = pages.map((p, i) => appendFooter(p, spec, i + 1, totalPages));

  if (spec.ligatureBroken) {
    return withFooters.map(applyLigatureBreaks);
  }
  return withFooters;
}

function validateSpec(spec: T212SynthSpec): void {
  if (spec.accounts.length === 0) throw new Error('accounts must be non-empty');
  if (spec.accounts.length > 3) throw new Error('accounts may have at most 3 entries (Invest + CFD + Crypto layout)');
  if (spec.accounts[0] !== 'Invest') throw new Error('first account must be Invest (T212 layout convention)');
  if (spec.sellTradeCount < 0) throw new Error('sellTradeCount must be >= 0');
  if (spec.dividendCount < 0) throw new Error('dividendCount must be >= 0');
  if (spec.distributionCount < 0) throw new Error('distributionCount must be >= 0');
  if (spec.year < 2020 || spec.year > 2030) throw new Error(`year ${spec.year} outside supported range 2020-2030`);
}

/**
 * Default spec used as a base for tests + ad-hoc generation. Override any field.
 */
export function defaultSpec(overrides: Partial<T212SynthSpec> = {}): T212SynthSpec {
  return {
    accounts: ['Invest'],
    baseCurrency: 'USD',
    language: 'en',
    year: 2025,
    sellTradeCount: 3,
    dividendCount: 2,
    distributionCount: 1,
    ligatureBroken: false,
    corporateActions: [],
    customerName: 'Synthetic Tester',
    customerId: '99999999',
    ...overrides,
  };
}
