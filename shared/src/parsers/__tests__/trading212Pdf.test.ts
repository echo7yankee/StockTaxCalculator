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
});
