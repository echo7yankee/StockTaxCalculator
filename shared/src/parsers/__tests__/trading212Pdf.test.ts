import { describe, it, expect } from 'vitest';
import { parseTrading212AnnualStatement } from '../trading212Pdf.js';

function overviewPage(overrides: Record<string, string> = {}): string {
  const defaults: Record<string, string> = {
    'Closed result': '$40,948.12',
    Profit: '$45,000.00',
    Loss: '$4,051.88',
    'Net Dividends': '$220.00',
    'Gross Dividends': '$256.00',
    'Tax Withheld': '$36.00',
    'Open result': '$5,000.00',
    'Account value': '$80,000.00',
  };
  const vals = { ...defaults, ...overrides };
  return `Annual Statement - 2025\n\n${Object.entries(vals)
    .map(([k, v]) => `${k}\t${v}`)
    .join('\n')}`;
}

function sellTradesPage(trades: string[] = []): string {
  const header = 'Sell Trades\nEXECUTION TIME\tINSTRUMENT\tISIN\tTYPE\tCURRENCY\tSIZE\tAVG PRICE\tEXEC PRICE\tFX RATE\tTRANS CURRENCY\tTOTAL RESULT';
  const defaultTrade = '15.03.2025 10:30\tApple Inc.\tUS0378331005\tStock\tUSD\t10\t130.00\t155.00\t1\tUSD\t250.00';
  const lines = trades.length > 0 ? trades : [defaultTrade];
  return `${header}\n${lines.join('\n')}`;
}

function dividendPage(rows: string[] = []): string {
  const header = 'Dividend Overview\nby instrument\nINSTRUMENT\tISIN\tCURRENCY\tCOUNTRY\tHOLDINGS\tDATE\tGROSS/SHARE\tGROSS\tFX RATE\tGROSS USD\tWHT RATE\tWHT\tNET';
  const defaultRow = 'Apple Inc.\tUS0378331005\tUSD\tUS\t10\t15.06.2025\t0.25\t2.50\t1\t2.50\t15%\t0.38\t2.12';
  const lines = rows.length > 0 ? rows : [defaultRow];
  return `${header}\n${lines.join('\n')}`;
}

describe('parseTrading212AnnualStatement', () => {
  it('detects year from "Annual Statement - YYYY"', () => {
    const result = parseTrading212AnnualStatement([overviewPage(), '', '']);
    expect(result.year).toBe(2025);
  });

  it('detects year from date range fallback', () => {
    const page = 'Some text\n01.01.2024 to 31.12.2024\nClosed result\t$100';
    const result = parseTrading212AnnualStatement([page, '', '']);
    expect(result.year).toBe(2024);
  });

  describe('overview parsing', () => {
    it('extracts closed result', () => {
      const result = parseTrading212AnnualStatement([overviewPage(), '', '']);
      expect(result.overview.closedResult).toBe(40948.12);
    });

    it('extracts profit and loss', () => {
      const result = parseTrading212AnnualStatement([overviewPage(), '', '']);
      expect(result.overview.profit).toBe(45000);
      expect(result.overview.loss).toBe(4051.88);
    });

    it('extracts dividend totals', () => {
      const result = parseTrading212AnnualStatement([overviewPage(), '', '']);
      expect(result.overview.netDividends).toBe(220);
      expect(result.overview.grossDividends).toBe(256);
      expect(result.overview.taxWithheld).toBe(36);
    });

    it('detects USD currency', () => {
      const result = parseTrading212AnnualStatement([overviewPage(), '', '']);
      expect(result.overview.currency).toBe('USD');
    });
  });

  describe('sell trades parsing', () => {
    it('parses a sell trade row', () => {
      const result = parseTrading212AnnualStatement([overviewPage(), '', sellTradesPage()]);
      expect(result.sellTrades).toHaveLength(1);
      const trade = result.sellTrades[0];
      expect(trade.isin).toBe('US0378331005');
      expect(trade.instrument).toBe('Apple Inc.');
      expect(trade.positionSize).toBe(10);
      expect(trade.totalResult).toBe(250);
    });

    it('skips rows with too few columns', () => {
      const badRow = '15.03.2025\tApple\tUS0378331005';
      const result = parseTrading212AnnualStatement([overviewPage(), '', sellTradesPage([badRow])]);
      expect(result.sellTrades).toHaveLength(0);
    });

    it('warns when sell trades section exists but no rows parsed', () => {
      const page = 'Sell Trades\nNo data here';
      const result = parseTrading212AnnualStatement([overviewPage(), '', page]);
      expect(result.warnings.some(w => w.includes('no rows could be parsed'))).toBe(true);
    });
  });

  describe('dividend parsing', () => {
    it('parses a dividend row', () => {
      const result = parseTrading212AnnualStatement([overviewPage(), '', '', dividendPage()]);
      expect(result.dividends).toHaveLength(1);
      const div = result.dividends[0];
      expect(div.isin).toBe('US0378331005');
      expect(div.instrument).toContain('Apple');
      expect(div.netAmountUsd).toBeGreaterThan(0);
    });
  });

  describe('cross-check warning', () => {
    it('warns when parsed total differs from overview', () => {
      const overview = overviewPage({ 'Closed result': '$1000.00' });
      const trades = sellTradesPage(); // totalResult = 250, overview says 1000
      const result = parseTrading212AnnualStatement([overview, '', trades]);
      if (result.sellTrades.length > 0) {
        expect(result.warnings.some(w => w.includes('differs from overview'))).toBe(true);
      }
    });
  });

  it('returns empty arrays when no sections found', () => {
    const result = parseTrading212AnnualStatement(['Some random text']);
    expect(result.sellTrades).toHaveLength(0);
    expect(result.dividends).toHaveLength(0);
    expect(result.distributions).toHaveLength(0);
  });

  // ─── Romanian PDF support ─────────────────────────────────────────────

  describe('Romanian PDF parsing', () => {
    function roOverviewPage(): string {
      return [
        'Declarație anuală - 2025',
        'Prezentare generală',
        'Trading 212 Invest',
        'ID cont: 21047390',
        'Rezultat închis\tRON 0.00',
        'Profit\tRON 0.00',
        'Pierdere\tRON 0.00',
        'Dividende nete\tRON 5.16',
        'Dividende brute\tRON 5.22',
        'Taxe reținute\tRON 0.06',
        'Rezultat deschis\tRON 1150.63',
        'Valoarea contului\tRON 4551.14',
      ].join('\n');
    }

    function roDividendPage(): string {
      return [
        'Cont Invest - Prezentare generală a dividendelor',
        'Dividende după țară',
        'Dividende după instrument',
        'INSTRUMENT\tISIN\tMONEDA\tȚARA\tPARTICIPAȚII\tDATA\tBRUT/ACȚIUNE\tBRUT\tCURS\tBRUT (RON)\tRATĂ WHT\tWHT (RON)\tNET (RON)',
        'Alphabet (Class A)\tUS02079K3059\tUSD\tUS\t0.0635448\t17.03.2025 16:19\t0.2\t0.01\t4.371369\t0.06\t10%\t0.01\t0.05',
        'Nvidia\tUS67066G1040\tUSD\tUS\t0.2318665\t02.04.2025 16:31\t0.01\t0\t4.79203\t0.01\t10%\t0\t0.01',
        'Alphabet (Class A)\tUS02079K3059\tUSD\tUS\t0.1299994\t16.06.2025 15:47\t0.21\t0.03\t4.477025\t0.12\t10%\t0.01\t0.11',
        'Alphabet (Class A)\tUS02079K3059\tUSD\tUS\t0.19476835\t15.09.2025 15:35\t0.21\t0.04\t4.346501\t0.18\t10%\t0.02\t0.16',
      ].join('\n');
    }

    function roDistributionPage(): string {
      return [
        'Cont Invest - prezentare generală a distribuțiilor',
        'Distribuții după țară',
        'Distribuții după instrument',
        'INSTRUMENT\tISIN\tMONEDA\tȚARA\tPARTICIPAȚII\tDATA\tBRUT/ACȚIUNE\tBRUT\tCURS\tBRUT (RON)\tRATĂ WHT\tWHT (RON)\tNET (RON)',
        'Vanguard S&P 500 (Dist)\tIE00B3XXRP09\tUSD\tIE\t0.390883\t02.04.2025 17:49\t0.32063\t0.13\t4.627826\t0.58\t-\t-\t0.58',
        'Vanguard S&P 500 (Dist)\tIE00B3XXRP09\tUSD\tIE\t0.5922259\t02.07.2025 15:53\t0.31292\t0.19\t4.316873\t0.8\t-\t-\t0.8',
        'Vanguard S&P 500 (Dist)\tIE00B3XXRP09\tUSD\tIE\t1.06823692\t01.10.2025 15:17\t0.301175\t0.32\t4.3138\t1.39\t-\t-\t1.39',
        'Vanguard S&P 500 (Dist)\tIE00B3XXRP09\tUSD\tIE\t1.43210714\t31.12.2025 17:33\t0.299086\t0.43\t4.3439\t1.86\t-\t-\t1.86',
      ].join('\n');
    }

    it('detects year from Romanian title "Declarație anuală - 2025"', () => {
      const result = parseTrading212AnnualStatement([roOverviewPage()]);
      expect(result.year).toBe(2025);
    });

    it('parses Romanian overview with RON currency', () => {
      const result = parseTrading212AnnualStatement([roOverviewPage()]);
      expect(result.overview.currency).toBe('RON');
      expect(result.overview.netDividends).toBe(5.16);
      expect(result.overview.grossDividends).toBe(5.22);
      expect(result.overview.taxWithheld).toBe(0.06);
      expect(result.overview.openResult).toBe(1150.63);
      expect(result.overview.accountValue).toBe(4551.14);
    });

    it('parses Romanian dividend rows', () => {
      const result = parseTrading212AnnualStatement([roOverviewPage(), '', '', roDividendPage()]);
      expect(result.dividends.length).toBeGreaterThanOrEqual(3);
      const alphabetDivs = result.dividends.filter(d => d.isin === 'US02079K3059');
      expect(alphabetDivs.length).toBeGreaterThanOrEqual(2);
      expect(alphabetDivs[0].instrumentCurrency).toBe('USD');
      expect(alphabetDivs[0].issuingCountry).toBe('US');
    });

    it('parses Romanian ETF distribution rows', () => {
      const result = parseTrading212AnnualStatement([roOverviewPage(), '', '', '', roDistributionPage()]);
      expect(result.distributions).toHaveLength(4);
      const vanguard = result.distributions[0];
      expect(vanguard.isin).toBe('IE00B3XXRP09');
      expect(vanguard.instrument).toContain('Vanguard');
      expect(vanguard.issuingCountry).toBe('IE');
      expect(vanguard.grossAmountUsd).toBeGreaterThan(0);
    });

    it('warns about missing sell trades in Romanian PDF without sales', () => {
      const result = parseTrading212AnnualStatement([roOverviewPage()]);
      expect(result.warnings.some(w => w.includes('No sell trades'))).toBe(true);
    });
  });

  // ─── Multi-page section continuation (Paul Adam 2026-05-19 regression) ───
  // T212 statements with high transaction counts split each section across multiple
  // pages. Only the FIRST page of a section carries the section heading; continuation
  // pages have only rows (sometimes with a repeated column header). Pre-fix parser
  // skipped continuation pages — Paul's PDF parsed 19/142 sell trades and 11/49
  // dividends. These tests pin the multi-page behavior.
  describe('multi-page section continuation', () => {
    function sellTradesHeadingPage(): string {
      return [
        'Sell Trades',
        'EXECUTION TIME\tINSTRUMENT\tISIN\tTYPE\tCURRENCY\tSIZE\tAVG PRICE\tEXEC PRICE\tFX RATE\tTRANS CURRENCY\tTOTAL RESULT',
        '15.03.2025 10:30\tApple Inc.\tUS0378331005\tStock\tUSD\t10\t130.00\t155.00\t1\tUSD\t250.00',
        '15.03.2025 10:31\tMicrosoft\tUS5949181045\tStock\tUSD\t5\t300.00\t350.00\t1\tUSD\t250.00',
        '15.03.2025 10:32\tAlphabet\tUS02079K3059\tStock\tUSD\t2\t100.00\t150.00\t1\tUSD\t100.00',
      ].join('\n');
    }

    function sellTradesContinuationPage(): string {
      // No section heading — just rows. T212's typical layout for page 2+ of sells.
      return [
        '15.04.2025 11:00\tAmazon\tUS0231351067\tStock\tUSD\t3\t140.00\t160.00\t1\tUSD\t60.00',
        '15.04.2025 11:01\tTesla\tUS88160R1014\tStock\tUSD\t1\t200.00\t250.00\t1\tUSD\t50.00',
        '15.04.2025 11:02\tNvidia\tUS67066G1040\tStock\tUSD\t4\t100.00\t125.00\t1\tUSD\t100.00',
        '15.04.2025 11:03\tMeta\tUS30303M1027\tStock\tUSD\t2\t250.00\t300.00\t1\tUSD\t100.00',
      ].join('\n');
    }

    function dividendHeadingPage(): string {
      return [
        'Dividend Overview',
        'by instrument',
        'INSTRUMENT\tISIN\tCURRENCY\tCOUNTRY\tHOLDINGS\tDATE\tGROSS/SHARE\tGROSS\tFX RATE\tGROSS USD\tWHT RATE\tWHT\tNET',
        'Apple Inc.\tUS0378331005\tUSD\tUS\t10\t15.06.2025\t0.25\t2.50\t1\t2.50\t15%\t0.38\t2.12',
        'Microsoft\tUS5949181045\tUSD\tUS\t5\t15.06.2025\t0.50\t2.50\t1\t2.50\t15%\t0.38\t2.12',
        'Alphabet\tUS02079K3059\tUSD\tUS\t2\t15.06.2025\t0.25\t0.50\t1\t0.50\t15%\t0.08\t0.42',
      ].join('\n');
    }

    function dividendContinuationPage(): string {
      // No section heading, no "by instrument" marker — just rows (with repeated column header).
      return [
        'INSTRUMENT\tISIN\tCURRENCY\tCOUNTRY\tHOLDINGS\tDATE\tGROSS/SHARE\tGROSS\tFX RATE\tGROSS USD\tWHT RATE\tWHT\tNET',
        'Amazon\tUS0231351067\tUSD\tUS\t3\t15.09.2025\t0.30\t0.90\t1\t0.90\t15%\t0.14\t0.76',
        'Tesla\tUS88160R1014\tUSD\tUS\t1\t15.09.2025\t0.20\t0.20\t1\t0.20\t15%\t0.03\t0.17',
      ].join('\n');
    }

    it('parses sell-trade rows from a continuation page (no section heading)', () => {
      const result = parseTrading212AnnualStatement([
        overviewPage({ 'Closed result': '$910.00' }),
        '',
        sellTradesHeadingPage(),
        sellTradesContinuationPage(),
      ]);
      // 3 from heading page + 4 from continuation page = 7
      expect(result.sellTrades).toHaveLength(7);
      expect(result.sellTrades.map(t => t.isin)).toContain('US30303M1027'); // Meta from continuation page
      expect(result.sellTrades.map(t => t.isin)).toContain('US0231351067'); // Amazon from continuation page
      const parsedTotal = result.sellTrades.reduce((s, t) => s + t.totalResult, 0);
      expect(parsedTotal).toBeCloseTo(910);
    });

    it('parses dividend rows from a continuation page (no heading, no "by instrument" marker)', () => {
      const result = parseTrading212AnnualStatement([
        overviewPage({ 'Gross Dividends': '$6.60' }),
        '',
        '',
        dividendHeadingPage(),
        dividendContinuationPage(),
      ]);
      // 3 from heading page + 2 from continuation page = 5
      expect(result.dividends).toHaveLength(5);
      expect(result.dividends.map(d => d.isin)).toContain('US0231351067'); // Amazon
      expect(result.dividends.map(d => d.isin)).toContain('US88160R1014'); // Tesla
    });

    it('stops parsing at the next section heading (sell rows on dividend page do not leak)', () => {
      const result = parseTrading212AnnualStatement([
        overviewPage(),
        '',
        sellTradesHeadingPage(),
        dividendHeadingPage(), // section boundary — sells should NOT pick up dividend page
      ]);
      // Only the 3 from sells heading page; dividend page is not a sell continuation.
      expect(result.sellTrades).toHaveLength(3);
      expect(result.dividends).toHaveLength(3);
    });

    it('cross-check warns when sell trades are missing rows (losses too — closedResult < 0)', () => {
      // Overview says -500 closed, but we only parse rows summing to a different number.
      const result = parseTrading212AnnualStatement([
        overviewPage({ 'Closed result': '-$500.00', Profit: '$0.00', Loss: '$500.00' }),
        '',
        sellTradesHeadingPage(), // 600 total result
      ]);
      // 600 vs -500 → diff = 1100 → warning fires regardless of sign
      expect(result.warnings.some(w => w.includes('differs from overview'))).toBe(true);
    });

    it('cross-check warns when parsed dividend gross differs from overview', () => {
      const result = parseTrading212AnnualStatement([
        overviewPage({ 'Gross Dividends': '$100.00' }), // overview says 100
        '',
        '',
        dividendHeadingPage(), // parsed total ~5.50
      ]);
      expect(result.warnings.some(w => w.includes('dividend gross'))).toBe(true);
    });
  });

  // ─── Multi-account horizontal layout (Florin Pop 2026-05-24 regression) ───
  // T212 places Invest, CFD, and Crypto overview blocks side-by-side as columns
  // on a single page-1 line, like:
  //   `Closed result\tRON 3,273.75\tClosed result\tRON -226.80\tClosed result\t€0.00`
  // Pre-fix parser scanned right-to-left and returned the CFD value (-226.80)
  // because €0.00 wasn't recognized as an explicit zero. Fix scans left-to-right
  // starting after the first keyword occurrence so it always lands on the
  // leftmost (Invest) value.
  describe('multi-account horizontal layout', () => {
    function multiAccountOverviewPage(): string {
      // Mirrors the actual extracted page 1 from Florin's PDF (anonymized).
      return [
        'CUSTOMER ID\tCUSTOMER NAME',
        '99999999\tAnonymized User',
        'Annual Statement - 2025',
        'Overview',
        'Trading 212 Invest\tTrading 212 CFD\tTrading 212 Crypto',
        'Account ID: 11111\tAccount ID: 22222\tAccount ID: 33333',
        'Closed result\tRON 3,273.75\tClosed result\tRON -226.80\tClosed result\t€0.00',
        'Net Dividends\tRON 264.70\tDividend adjustments\tRON 0.00\tAccount value\t€400.87',
        'Gross Dividends\tRON 332.34\tReceived\tRON 0.00',
        'Tax Withheld\tRON 67.63\tDeducted\tRON 0.00',
        'Open result\tRON -16,310.37\tOpen result\tRON 0.00',
        'Account value\tRON 24,805.60\tAccount value\tRON 0.00',
      ].join('\n');
    }

    it('returns Invest closed result, not CFD, when both are on the same line', () => {
      const result = parseTrading212AnnualStatement([multiAccountOverviewPage()]);
      expect(result.overview.closedResult).toBeCloseTo(3273.75, 2);
    });

    it('detects RON currency from the Invest column', () => {
      const result = parseTrading212AnnualStatement([multiAccountOverviewPage()]);
      expect(result.overview.currency).toBe('RON');
    });

    it('extracts the Invest column values for dividend fields', () => {
      const result = parseTrading212AnnualStatement([multiAccountOverviewPage()]);
      expect(result.overview.netDividends).toBeCloseTo(264.70, 2);
      expect(result.overview.grossDividends).toBeCloseTo(332.34, 2);
      expect(result.overview.taxWithheld).toBeCloseTo(67.63, 2);
    });

    it('extracts the Invest column for account value (not CFD or Crypto)', () => {
      const result = parseTrading212AnnualStatement([multiAccountOverviewPage()]);
      expect(result.overview.accountValue).toBeCloseTo(24805.60, 2);
    });

    it('emits no CFD-only warning when both Invest and CFD are present', () => {
      const result = parseTrading212AnnualStatement([multiAccountOverviewPage()]);
      expect(result.warnings.some(w => w.includes('No Invest account section'))).toBe(false);
    });
  });

  // ─── CFD-only or Crypto-only PDF upload (defensive warning) ───
  describe('non-Invest statement detection', () => {
    it('warns when only CFD section is present', () => {
      const cfdOnlyPage = [
        'Annual Statement - 2025',
        'Overview',
        'Trading 212 CFD',
        'Account ID: 22222',
        'Closed result\tRON -226.80',
      ].join('\n');
      const result = parseTrading212AnnualStatement([cfdOnlyPage]);
      expect(result.warnings.some(w => w.includes('No Invest account section'))).toBe(true);
    });

    it('warns when only Crypto section is present', () => {
      const cryptoOnlyPage = [
        'Annual Statement - 2025',
        'Overview',
        'Trading 212 Crypto',
        'Account ID: 33333',
        'Closed result\t€0.00',
      ].join('\n');
      const result = parseTrading212AnnualStatement([cryptoOnlyPage]);
      expect(result.warnings.some(w => w.includes('No Invest account section'))).toBe(true);
    });

    it('does not warn when Invest section is present (single-account PDF)', () => {
      const result = parseTrading212AnnualStatement([overviewPage()]);
      expect(result.warnings.some(w => w.includes('No Invest account section'))).toBe(false);
    });
  });

  // ─── Broker mismatch: a non-Trading212 PDF (Mihai 2026-06-20) ───
  // The 3rd paying customer uploaded a 42-page Interactive Brokers PDF and saw a
  // confusing "0 sells / defaulted 2025". A PDF carrying NONE of the recognizable
  // Trading212 markers and zero parsed rows is flagged so the UI can redirect the
  // user to the CSV export instead of showing a bare zero.
  describe('broker mismatch detection (non-Trading212 PDF)', () => {
    // No Annual-Statement header, no T212 section keywords, no Invest/CFD/Crypto
    // anchor, mimicking an IBKR Activity Statement PDF.
    const ibkrLikePage = [
      'Interactive Brokers LLC',
      'Activity Statement',
      'Account U1234567',
      'Realized & Unrealized Performance Summary',
      'Symbol\tQuantity\tProceeds\tCost Basis\tRealized P/L',
      'AAPL\t10\t1500.00\t1300.00\t200.00',
    ].join('\n');

    it('flags brokerMismatch with a single clear redirect warning', () => {
      const result = parseTrading212AnnualStatement([ibkrLikePage]);
      expect(result.brokerMismatch).toBe(true);
      expect(result.sellTrades).toHaveLength(0);
      expect(result.dividends).toHaveLength(0);
      expect(result.distributions).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('does not look like a Trading 212 statement'))).toBe(true);
    });

    it('replaces the generic year/section warnings, keeping exactly one (the #24A hard-stop still fires)', () => {
      const result = parseTrading212AnnualStatement([ibkrLikePage]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings.some(w => w.includes('Could not detect year'))).toBe(false);
      expect(result.warnings.some(w => w.includes('No sell trades section'))).toBe(false);
    });

    it('does NOT flag a real Trading212 statement with sell trades', () => {
      const result = parseTrading212AnnualStatement([overviewPage({ 'Closed result': '$250.00' }), '', sellTradesPage()]);
      expect(result.brokerMismatch).toBe(false);
    });

    it('does NOT flag a sparse Trading212 statement carrying only the Annual Statement header', () => {
      const result = parseTrading212AnnualStatement([overviewPage()]);
      expect(result.brokerMismatch).toBe(false);
      // It still gets the ordinary missing-sells warning, not the redirect.
      expect(result.warnings.some(w => w.includes('No sell trades section'))).toBe(true);
      expect(result.warnings.some(w => w.includes('does not look like'))).toBe(false);
    });

    it('does NOT flag a Romanian Trading212 statement carrying the Invest anchor', () => {
      const roSparse = [
        'Declarație anuală - 2025',
        'Trading 212 Invest',
        'Rezultat închis\tRON 0.00',
      ].join('\n');
      const result = parseTrading212AnnualStatement([roSparse]);
      expect(result.brokerMismatch).toBe(false);
    });
  });
});
