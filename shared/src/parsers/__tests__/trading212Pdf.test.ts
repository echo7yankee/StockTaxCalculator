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
});
