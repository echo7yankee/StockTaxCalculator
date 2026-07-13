import { describe, it, expect } from 'vitest';
import { parseTrading212Csv } from '../trading212.js';
import type { RawCsvRow } from '../../types/transaction.js';

function makeRow(overrides: Partial<RawCsvRow> = {}): RawCsvRow {
  return {
    Action: 'Market buy',
    Time: '2025-03-15T10:30:00Z',
    ISIN: 'US0378331005',
    Ticker: 'AAPL',
    Name: 'Apple Inc.',
    'No. of shares': '10',
    'Price / share': '150.50',
    'Currency (Price / share)': 'USD',
    'Exchange rate': '1',
    Total: '1505.00',
    'Withholding tax': '0',
    'Currency (Withholding tax)': 'USD',
    ID: 'tx-001',
    ...overrides,
  } as RawCsvRow;
}

describe('parseTrading212Csv', () => {
  it('returns warning for empty rows', () => {
    const result = parseTrading212Csv([]);
    expect(result.transactions).toHaveLength(0);
    expect(result.warnings).toContain('CSV file is empty or has no data rows.');
  });

  it('warns about missing Action column', () => {
    const row = { Time: '2025-01-01', Total: '100' } as RawCsvRow;
    const result = parseTrading212Csv([row]);
    expect(result.warnings.some(w => w.includes('Missing "Action" column'))).toBe(true);
  });

  describe('action mapping', () => {
    it.each([
      ['Market buy', 'buy'],
      ['Limit buy', 'buy'],
      ['Stop buy', 'buy'],
      ['Market sell', 'sell'],
      ['Limit sell', 'sell'],
      ['Stop sell', 'sell'],
      ['Dividend (Ordinary)', 'dividend'],
      ['Dividend (Dividend)', 'dividend'],
    ])('maps "%s" to "%s"', (raw, expected) => {
      const result = parseTrading212Csv([makeRow({ Action: raw })]);
      expect(result.transactions[0].action).toBe(expected);
    });

    it('maps unknown buy-like actions via fallback', () => {
      const result = parseTrading212Csv([makeRow({ Action: 'Conditional buy' })]);
      expect(result.transactions[0].action).toBe('buy');
    });
  });

  it('skips deposits and withdrawals', () => {
    const rows = [
      makeRow({ Action: 'Deposit' }),
      makeRow({ Action: 'Withdrawal' }),
    ];
    const result = parseTrading212Csv(rows);
    expect(result.transactions).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped[0].reason).toContain('not taxable');
  });

  describe('interest income', () => {
    it('does not emit an interest transaction (interest is out of scope)', () => {
      const result = parseTrading212Csv([makeRow({ Action: 'Interest on cash' })]);
      expect(result.transactions).toHaveLength(0);
    });

    it('routes an interest row to skipped with a declare-separately reason', () => {
      const result = parseTrading212Csv([makeRow({ Action: 'Interest on cash' })]);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toContain('Interest income is not calculated');
    });

    it('fires a warning when an interest row is present', () => {
      const result = parseTrading212Csv([makeRow({ Action: 'Interest on cash' })]);
      expect(result.warnings.some(w => w.includes('interest-income row'))).toBe(true);
    });

    it('counts multiple interest rows in the one warning', () => {
      const result = parseTrading212Csv([
        makeRow({ Action: 'Interest on cash' }),
        makeRow({ Action: 'Interest on cash' }),
      ]);
      expect(result.warnings.some(w => w.includes('Detected 2 interest-income row'))).toBe(true);
    });

    it('also matches interest via the lowercase fallback', () => {
      const result = parseTrading212Csv([makeRow({ Action: 'Accrued interest' })]);
      expect(result.transactions).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('interest-income row'))).toBe(true);
    });

    it('does NOT fire the interest warning for a normal buy/sell/dividend CSV', () => {
      const result = parseTrading212Csv([
        makeRow({ Action: 'Market buy' }),
        makeRow({ Action: 'Market sell' }),
        makeRow({ Action: 'Dividend (Ordinary)' }),
      ]);
      expect(result.transactions).toHaveLength(3);
      expect(result.warnings.some(w => w.includes('interest-income row'))).toBe(false);
    });
  });

  it('skips unknown actions', () => {
    const result = parseTrading212Csv([makeRow({ Action: 'Foo bar' })]);
    expect(result.transactions).toHaveLength(0);
    expect(result.skipped[0].reason).toContain('Unknown action');
  });

  it('skips rows with invalid dates', () => {
    const result = parseTrading212Csv([makeRow({ Time: 'not-a-date' })]);
    expect(result.transactions).toHaveLength(0);
    expect(result.skipped[0].reason).toContain('Invalid date');
  });

  it('parses numbers with commas', () => {
    const result = parseTrading212Csv([makeRow({ Total: '1,505.00', 'No. of shares': '1,000' })]);
    expect(result.transactions[0].totalAmountOriginal).toBe(1505);
    expect(result.transactions[0].shares).toBe(1000);
  });

  it('handles missing/empty number fields gracefully', () => {
    const result = parseTrading212Csv([makeRow({ 'No. of shares': '', 'Exchange rate': '' })]);
    expect(result.transactions[0].shares).toBe(0);
    expect(result.transactions[0].exchangeRateToLocal).toBe(1); // fallback to 1
  });

  it('defaults currency to USD when missing', () => {
    const result = parseTrading212Csv([makeRow({ 'Currency (Price / share)': '' })]);
    expect(result.transactions[0].priceCurrency).toBe('USD');
  });

  it('takes absolute value of shares and total', () => {
    const result = parseTrading212Csv([makeRow({ Action: 'Market sell', 'No. of shares': '-5', Total: '-750' })]);
    expect(result.transactions[0].shares).toBe(5);
    expect(result.transactions[0].totalAmountOriginal).toBe(750);
  });

  it('generates ID from index when ID column is missing', () => {
    const result = parseTrading212Csv([makeRow({ ID: '' })]);
    expect(result.transactions[0].id).toBe('t212-0');
  });

  it('parses a complete buy transaction correctly', () => {
    const result = parseTrading212Csv([makeRow()]);
    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.action).toBe('buy');
    expect(tx.isin).toBe('US0378331005');
    expect(tx.ticker).toBe('AAPL');
    expect(tx.securityName).toBe('Apple Inc.');
    expect(tx.shares).toBe(10);
    expect(tx.pricePerShare).toBe(150.5);
    expect(tx.priceCurrency).toBe('USD');
    expect(tx.totalAmountOriginal).toBe(1505);
    expect(tx.brokerTransactionId).toBe('tx-001');
  });

  // T212's "Total" column is in the ACCOUNT base currency while priceCurrency is
  // the instrument's; totalAmountOriginal must be stored in priceCurrency so the
  // downstream per-currency BNR conversion applies the matching rate.
  describe('foreign-currency Total -> instrument currency', () => {
    it('divides the account-currency Total by the exchange rate to get the instrument amount', () => {
      // EUR account holding a USD stock: Total = shares*price*rate = 10*185.50*0.92
      // = 1706.60 EUR, but the instrument amount is 1855 USD.
      const result = parseTrading212Csv([
        makeRow({ 'No. of shares': '10', 'Price / share': '185.50', 'Exchange rate': '0.92', Total: '1706.60' }),
      ]);
      expect(result.transactions[0].priceCurrency).toBe('USD');
      expect(result.transactions[0].totalAmountOriginal).toBeCloseTo(1855, 2);
    });

    it('leaves a same-currency account (exchange rate 1) byte-identical', () => {
      const result = parseTrading212Csv([
        makeRow({ 'No. of shares': '10', 'Price / share': '150.50', 'Exchange rate': '1', Total: '1505.00' }),
      ]);
      expect(result.transactions[0].totalAmountOriginal).toBe(1505);
    });

    it('converts a foreign dividend Total (shares = 0, so shares*price cannot)', () => {
      // Dividend gross 2.21 EUR = 2.402 USD @ 0.92; WHT stays raw (already USD).
      const result = parseTrading212Csv([
        makeRow({
          Action: 'Dividend (Ordinary)', 'No. of shares': '0', 'Price / share': '0.24',
          'Exchange rate': '0.92', Total: '2.21', 'Withholding tax': '0.33',
        }),
      ]);
      expect(result.transactions[0].action).toBe('dividend');
      expect(result.transactions[0].totalAmountOriginal).toBeCloseTo(2.402, 2);
      expect(result.transactions[0].withholdingTaxOriginal).toBeCloseTo(0.33, 2);
    });
  });
});
