# romanian-investment-tax

Deterministic, **zero-dependency** estimate of Romanian personal investment tax
for the *Declarația Unică* (D212): capital gains, dividends (with the foreign
withholding-tax credit), and the CASS health contribution.

Runs fully offline. No network call, no API key. Tax year **2025** (income
earned in 2025, filed by 25 May 2026).

> Powered by [**InvesTax**](https://investax.app). This library is the same free,
> manual estimate as the InvesTax quick calculator. The full product parses real
> broker statements (Trading 212, IBKR, Revolut), converts every transaction at
> the BNR rate for its date, applies weighted-average cost basis, and generates
> the filing-ready D212 XML. If you have a broker statement rather than manual
> figures, use [investax.app](https://investax.app).

## Install

```sh
npm install romanian-investment-tax
```

Requires an ESM environment (Node 18+, or any modern bundler).

## Usage

```ts
import { calculateRomanianInvestmentTax } from 'romanian-investment-tax';

const result = calculateRomanianInvestmentTax({
  capitalGains: 50000,       // net RON gains from securities transfers
  dividends: 10000,          // gross RON dividends
  withholdingTaxPaid: 1000,  // foreign tax already withheld on those dividends (RON)
  // otherNonSalaryIncome: 0 // optional: other income that counts toward the CASS base
});

console.log(result);
// {
//   capitalGainsTax: 5000,      // 10% of gains
//   dividendTax: 0,             // 10% of dividends, minus the 1000 withheld
//   healthContribution: 4860,   // CASS: fixed 12x-plafon amount (base = 60.000)
//   cassBracket: '12x',
//   totalOwed: 9860,
//   earlyFilingDiscount: 150,   // 3% bonificatie on the income tax (not CASS)
//   totalAfterDiscount: 9710,
//   taxYear: 2025,
//   currency: 'RON'
// }
```

All amounts are **RON** and must already be converted from any foreign currency
(the full InvesTax product does the per-transaction BNR conversion for you).
Results are unrounded so you can round to your own precision.

## How it works (tax year 2025)

- **Capital gains:** 10% flat on net gains. A net loss owes no tax.
- **Dividends:** 10% on the gross, reduced by the foreign withholding tax already
  paid (the credit never drops the tax below 0).
- **CASS (health):** a **fixed** amount by bracket, not a percentage of income.
  The base is total non-salary income (gains clamped to non-negative, plus
  dividends, plus any `otherNonSalaryIncome`):

  | Total non-salary income (RON) | Bracket | CASS owed (RON) |
  | ----------------------------- | ------- | --------------- |
  | below 24.300                  | none    | 0               |
  | 24.300 to 48.600              | 6x      | 2.430           |
  | 48.600 to 97.200              | 12x     | 4.860           |
  | 97.200 and above              | 24x     | 9.720           |

- **Early-filing bonificatie:** 3% of the income tax (capital gains + dividends,
  excluding CASS) if filed before 15 May 2026.

The config is exported if you want to inspect or extend it:

```ts
import { ROMANIA_TAX_2025, calculateRomanianInvestmentTax } from 'romanian-investment-tax';

console.log(ROMANIA_TAX_2025.capitalGainsTaxRate); // 0.1

// You can pass your own config as the 2nd argument (e.g. a future tax year).
calculateRomanianInvestmentTax(input, { ...ROMANIA_TAX_2025, taxYear: 2026 });
```

## Scope and disclaimer

This is an **estimate for the manual figures you supply**, the same logic as the
free InvesTax calculator. It does **not**:

- parse broker statements or do per-transaction BNR currency conversion,
- apply weighted-average cost basis across your trade history,
- handle stock splits, or
- generate the filing-ready D212 declaration.

Those are the [InvesTax](https://investax.app) product. This library is **not tax
advice**. Rates are for tax year 2025; Legea 239/2025 raises capital-gains and
dividend rates to 16% for income year 2026 (filed 2027), which a future release
will add as a separate config.

## License

MIT. Powered by [InvesTax](https://investax.app).
