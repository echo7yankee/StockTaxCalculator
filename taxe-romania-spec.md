# TaxeRomania — Romanian Investment Tax Calculator

## PROJECT BRIEF (Read This First)

**What:** A web application that helps Romanian retail investors calculate their taxes from foreign broker accounts (Trading212, Revolut, IBKR) and generates the numbers needed for the annual Declarația Unică (Form D212) filing with ANAF.

**Why:** Hundreds of thousands of Romanians invest through foreign brokers. Every year by May 25th, they must manually calculate capital gains, dividends, and CASS (health insurance contribution) from CSV exports and file the Declarația Unică. This process takes hours, is error-prone, and most people either overpay, underpay, or hire an accountant (€50-100+). No existing tool automates CSV parsing + tax calculation end-to-end.

**Who:** The developer is Dragos — a frontend developer with 7 years of experience (Adobe, React, TypeScript, Node.js, Playwright). He personally went through this pain calculating ~28,500 RON in tax liability from his Trading212 portfolio (NVDA, GOOGL, AMD, SOFI, VALE, MP Materials, VOO, and significant PLTR sales). He is based in Romania.

**Target User:** Salaried Romanian who also invests through Trading212, Revolut, IBKR, or XTB. Not PFA/freelancer-focused (SOLO.ro already covers that). Typical user has a day job + investment portfolio + maybe rental income.

**Monetization:** Free tier (manual calculator). Paid tier €10-15/year (CSV upload + automatic calculation + D212-ready output).

---

## COMPETITIVE LANDSCAPE

| Competitor | What it does | Gap |
|---|---|---|
| ImpoziteOnline.ro | Manual tax calculator — you type in numbers | No CSV import, no automation |
| SOLO.ro | Full PFA accounting + Declarația Unică | Targets PFA owners, not salaried investors |
| StartCo.ro | Free D212 generator | Basic, no broker integration |
| TaxePFA (GitHub) | Open-source PFA tax calculator | PFA only, no investment support |
| Accountess.ro | Blog guides + accounting services | Education, not tooling |

**Our differentiator:** Upload your Trading212 CSV → get automatic tax calculations → get exact numbers for D212. No manual data entry.

---

## ROMANIAN TAX RULES (Critical Business Logic)

### Capital Gains Tax

For **foreign brokers** (Trading212, IBKR, Revolut — NOT registered in Romania):
- **10% flat tax** on net capital gains (regardless of holding period)
- Method: **Weighted Average Cost (Preț Mediu Ponderat)** since January 1, 2023
- Before 2023: FIFO method was used
- Losses can be offset against gains within the same year
- Losses CANNOT be carried forward to future years (unlike some EU countries)

For **Romanian brokers** (XTB Romania, Tradeville):
- **1% tax** if held > 365 days
- **3% tax** if held ≤ 365 days
- Broker withholds and pays tax automatically
- Investor does NOT need to file D212 for these (broker handles it)
- However, these gains DO count toward CASS thresholds

### Dividend Tax

- **10% on dividends** from Romanian companies (withheld at source by company)
- **Foreign dividends:** Must be declared by investor. Apply double taxation treaty.
  - US dividends: 30% withheld by default, 10% with W-8BEN form signed
  - If foreign tax ≥ Romanian tax (10%), no additional Romanian tax owed, but still must declare
  - If foreign tax < 10%, pay the difference to Romania
  - Credit method: Romania credits foreign tax paid, up to 10% of gross dividend
- Starting January 1, 2026: dividend tax increased to **16%** (from previous 8%, then 10%)

### CASS (Contribuția de Asigurări Sociale de Sănătate)

Health insurance contribution on investment income. Calculated on ALL combined non-salary income:
- Capital gains + dividends + interest + rental income + crypto + freelance

**Thresholds (2025 values, 2026 TBD but likely similar):**

| Combined non-salary income | CASS owed |
|---|---|
| < 24,300 RON (6 × minimum wage) | 0 RON |
| 24,300 — 48,600 RON (6-12 × min wage) | 2,430 RON (fixed) |
| 48,600 — 97,200 RON (12-24 × min wage) | 4,860 RON (fixed) |
| > 97,200 RON (> 24 × min wage) | 9,720 RON (fixed) |

Minimum gross wage for 2025: 4,050 RON/month.

### Filing Deadlines
- **April 15:** Early filing deadline (3% discount on income tax, NOT on CASS)
- **May 25:** Final deadline for Declarația Unică (Form D212)

### Currency Conversion
- All amounts must be converted to RON using **BNR (National Bank of Romania) exchange rate** on the date of each transaction
- This is critical: EUR/RON fluctuation can significantly amplify apparent gains

---

## TRADING212 CSV FORMAT

Trading212 exports a CSV with all transactions. This is the primary format to support in MVP.

### CSV Columns (Trading212 "Statement" export)

```
Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result (EUR),Total (EUR),Withholding tax,Currency (Withholding tax),Charge amount (EUR),Stamp duty reserve tax (EUR),Notes,ID,Currency conversion fee (EUR)
```

### Key Fields:
- **Action:** `Market buy`, `Market sell`, `Limit buy`, `Limit sell`, `Dividend (Ordinary)`, `Dividend (Dividend)`, `Deposit`, `Withdrawal`, `Interest on cash`, `Currency conversion`
- **Time:** ISO format `2024-01-15 14:30:00`
- **ISIN:** International Securities Identification Number
- **Ticker:** Stock ticker (e.g., `NVDA`, `GOOGL`)
- **No. of shares:** Can be fractional (e.g., `0.5`)
- **Price / share:** Price in original currency
- **Currency (Price / share):** `USD`, `EUR`, `GBP`
- **Exchange rate:** Trading212's internal rate (NOT BNR rate — we need to use BNR rate instead)
- **Result (EUR):** Gain/loss in EUR for sells
- **Total (EUR):** Total transaction value in EUR
- **Withholding tax:** Tax withheld on dividends (e.g., US 15% with W-8BEN or 30% without)
- **Currency (Withholding tax):** Currency of withholding

### Processing Logic:

1. **Parse CSV** — handle date formats, decimal separators, missing values
2. **Fetch BNR exchange rates** — for each transaction date, get EUR/RON and USD/RON from BNR
   - BNR API: `https://www.bnr.ro/nbrfxrates.xml` (current day)
   - Historical: `https://www.bnr.ro/files/xml/years/nbrfxrates{YYYY}.xml`
3. **Convert all amounts to RON** using BNR rate on transaction date
4. **Group by ISIN/Ticker** — track buy lots and sells per security
5. **Calculate cost basis** using Weighted Average Cost method:
   - Each buy updates the weighted average: `new_avg = (old_avg × old_qty + buy_price_RON × buy_qty) / (old_qty + buy_qty)`
   - Each sell: `gain = (sell_price_RON - weighted_avg_cost_RON) × shares_sold`
6. **Sum capital gains and losses** across all securities
7. **Process dividends** — gross amount in RON, withholding tax paid, Romanian tax owed (if any)
8. **Calculate CASS** based on combined income thresholds

---

## TECH STACK

### Frontend
- **React 18+** with TypeScript
- **Vite** for bundling
- **TailwindCSS** for styling
- No component library initially — keep it lean
- CSV parsing: **PapaParse**
- Charts (optional for dashboard): **Recharts**

### Backend
- **Node.js + Express** with TypeScript
- **PostgreSQL** via Prisma ORM (or start with SQLite for MVP simplicity)
- BNR rate fetching + caching
- CSV processing engine

### Authentication
- **Google OAuth** for login (simple, no password management)
- JWT tokens for session management

### Deployment
- Frontend: Vercel or Netlify (free tier)
- Backend: Railway, Render, or Fly.io (free/cheap tier)
- Database: Supabase (free tier PostgreSQL) or Railway

### Payments (post-MVP)
- **Stripe** for subscriptions
- Simple plan: Free (manual calc) / Paid (€10-15/year for CSV upload + automation)

---

## DATABASE SCHEMA (MVP)

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  google_id VARCHAR(255) UNIQUE,
  plan VARCHAR(20) DEFAULT 'free', -- 'free' | 'paid'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tax Years (one per user per year)
CREATE TABLE tax_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  year INTEGER NOT NULL, -- e.g., 2025
  status VARCHAR(20) DEFAULT 'draft', -- 'draft' | 'calculated' | 'filed'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, year)
);

-- CSV Uploads (raw file tracking)
CREATE TABLE csv_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year_id UUID REFERENCES tax_years(id),
  broker VARCHAR(50) NOT NULL, -- 'trading212' | 'revolut' | 'ibkr' | 'xtb'
  filename VARCHAR(255),
  uploaded_at TIMESTAMP DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE,
  row_count INTEGER
);

-- Parsed Transactions (from CSV)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  csv_upload_id UUID REFERENCES csv_uploads(id),
  tax_year_id UUID REFERENCES tax_years(id),
  action VARCHAR(50) NOT NULL, -- 'buy' | 'sell' | 'dividend' | 'interest'
  transaction_date TIMESTAMP NOT NULL,
  isin VARCHAR(20),
  ticker VARCHAR(20),
  security_name VARCHAR(255),
  shares DECIMAL(18,8),
  price_per_share DECIMAL(18,6),
  price_currency VARCHAR(3), -- 'USD' | 'EUR' | 'GBP'
  total_amount_original DECIMAL(18,4), -- in original currency
  bnr_rate_to_ron DECIMAL(12,6), -- BNR exchange rate on transaction date
  total_amount_ron DECIMAL(18,4), -- converted to RON
  withholding_tax_original DECIMAL(18,4),
  withholding_tax_currency VARCHAR(3),
  withholding_tax_ron DECIMAL(18,4),
  trading212_id VARCHAR(100), -- original transaction ID from CSV
  created_at TIMESTAMP DEFAULT NOW()
);

-- BNR Exchange Rates Cache
CREATE TABLE bnr_rates (
  id SERIAL PRIMARY KEY,
  rate_date DATE NOT NULL,
  currency VARCHAR(3) NOT NULL, -- 'USD' | 'EUR' | 'GBP'
  rate DECIMAL(12,6) NOT NULL, -- RON per 1 unit of currency
  UNIQUE(rate_date, currency)
);

-- Tax Calculations (computed results)
CREATE TABLE tax_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year_id UUID REFERENCES tax_years(id),
  -- Capital gains
  total_capital_gains_ron DECIMAL(18,4),
  total_capital_losses_ron DECIMAL(18,4),
  net_capital_gains_ron DECIMAL(18,4),
  capital_gains_tax_ron DECIMAL(18,4), -- 10% of net gains
  -- Dividends
  total_dividends_gross_ron DECIMAL(18,4),
  total_withholding_tax_ron DECIMAL(18,4),
  dividend_tax_owed_ron DECIMAL(18,4), -- 10% minus credited foreign tax
  -- CASS
  total_non_salary_income_ron DECIMAL(18,4),
  cass_owed_ron DECIMAL(18,4),
  cass_threshold_hit VARCHAR(10), -- 'none' | '6x' | '12x' | '24x'
  -- Totals
  total_tax_owed_ron DECIMAL(18,4),
  early_filing_discount_ron DECIMAL(18,4), -- 3% of income tax if filed by April 15
  calculated_at TIMESTAMP DEFAULT NOW()
);

-- Per-Security Breakdown (for detailed view)
CREATE TABLE security_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_calculation_id UUID REFERENCES tax_calculations(id),
  isin VARCHAR(20),
  ticker VARCHAR(20),
  security_name VARCHAR(255),
  total_bought_shares DECIMAL(18,8),
  total_sold_shares DECIMAL(18,8),
  remaining_shares DECIMAL(18,8),
  weighted_avg_cost_ron DECIMAL(18,4),
  total_proceeds_ron DECIMAL(18,4),
  total_cost_basis_ron DECIMAL(18,4),
  realized_gain_loss_ron DECIMAL(18,4),
  total_dividends_ron DECIMAL(18,4),
  total_withholding_tax_ron DECIMAL(18,4)
);
```

---

## MVP FEATURES (Phase 1 — 4-6 weeks)

### 1. Landing Page
- Clear value proposition: "Calculează-ți taxele din investiții în 2 minute"
- How it works (3 steps): Upload CSV → We calculate → You file
- Pricing: Free calculator / €10-15 for automation
- CTA: Sign in with Google

### 2. Manual Tax Calculator (Free Tier)
- Input fields for: total capital gains, total dividends, withholding tax paid, other non-salary income
- Calculates: income tax, CASS, total owed, early filing discount
- No account needed
- This competes directly with ImpoziteOnline.ro but with better UX

### 3. CSV Upload + Auto-Calculation (Paid Tier)
- Upload Trading212 CSV
- Auto-detect broker format
- Parse all transactions
- Fetch BNR rates for each transaction date (cache them)
- Calculate weighted average cost per security
- Calculate capital gains per security and total
- Calculate dividend income and withholding tax credits
- Calculate CASS based on all income
- Show detailed breakdown by security
- Show summary with exact numbers for D212 sections

### 4. Results Dashboard
- Summary card: Total tax owed, broken down by type
- Timeline: Filing deadline countdown
- Per-security breakdown table
- Dividend income summary with foreign tax credits
- CASS calculation with threshold indicator
- Export: PDF report with all numbers needed for D212
- Copy-paste helper: exact values for each D212 field

### 5. Authentication
- Google OAuth login
- Save calculations to account
- Access previous years

---

## PHASE 2 FEATURES (Post-MVP)

- **Revolut CSV support** (different format)
- **IBKR Activity Statement support** (XML/CSV)
- **Rental income module** (add rental properties, track income/expenses)
- **D212 PDF pre-fill** (generate a partially filled D212 PDF)
- **Multi-year comparison** (year over year tax summary)
- **Crypto support** (Binance, Coinbase CSV imports)
- **Tax optimization tips** (e.g., "if you sell X before Dec 31, your CASS drops to lower bracket")
- **Email reminders** (filing deadline reminders)
- **Romanian language** (MVP can be bilingual RO/EN, but RO is primary)

---

## API ENDPOINTS (MVP)

```
Authentication:
POST   /api/auth/google          — Google OAuth callback
GET    /api/auth/me               — Get current user
POST   /api/auth/logout           — Logout

Tax Years:
GET    /api/tax-years             — List user's tax years
POST   /api/tax-years             — Create new tax year
GET    /api/tax-years/:id         — Get tax year details

CSV Processing:
POST   /api/tax-years/:id/upload  — Upload broker CSV
GET    /api/tax-years/:id/transactions — Get parsed transactions
DELETE /api/tax-years/:id/upload/:uploadId — Remove an upload

Calculations:
POST   /api/tax-years/:id/calculate — Run tax calculation
GET    /api/tax-years/:id/results   — Get calculation results
GET    /api/tax-years/:id/results/securities — Per-security breakdown
GET    /api/tax-years/:id/results/dividends  — Dividend breakdown

Manual Calculator:
POST   /api/calculator/quick      — Stateless quick calculation (free tier)

BNR Rates:
GET    /api/bnr-rates/:date       — Get rate for specific date
POST   /api/bnr-rates/sync        — Admin: sync rates for date range

Export:
GET    /api/tax-years/:id/export/pdf — Download PDF report
GET    /api/tax-years/:id/export/d212-helper — D212 field mapping
```

---

## PROJECT STRUCTURE

```
taxe-romania/
├── client/                     # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/         # Header, Footer, Sidebar
│   │   │   ├── calculator/     # Manual calculator components
│   │   │   ├── upload/         # CSV upload + progress
│   │   │   ├── results/        # Tax calculation results
│   │   │   └── common/         # Buttons, Cards, etc.
│   │   ├── pages/
│   │   │   ├── Landing.tsx
│   │   │   ├── Calculator.tsx  # Free manual calculator
│   │   │   ├── Dashboard.tsx   # Authenticated user home
│   │   │   ├── Upload.tsx      # CSV upload flow
│   │   │   └── Results.tsx     # Tax calculation results
│   │   ├── hooks/
│   │   ├── services/           # API client
│   │   ├── utils/
│   │   │   └── taxCalculations.ts  # Client-side calc for free tier
│   │   ├── types/
│   │   └── App.tsx
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── server/                     # Node.js backend
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── taxYears.ts
│   │   │   ├── upload.ts
│   │   │   ├── calculations.ts
│   │   │   ├── calculator.ts
│   │   │   └── bnrRates.ts
│   │   ├── services/
│   │   │   ├── csvParser/
│   │   │   │   ├── trading212.ts    # Trading212 CSV parser
│   │   │   │   ├── revolut.ts       # Phase 2
│   │   │   │   └── ibkr.ts          # Phase 2
│   │   │   ├── bnrRateService.ts    # Fetch + cache BNR rates
│   │   │   ├── taxEngine.ts         # Core tax calculation logic
│   │   │   ├── cassCalculator.ts    # CASS threshold logic
│   │   │   └── dividendProcessor.ts # Dividend + withholding logic
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   └── rateLimit.ts
│   │   ├── models/              # Prisma or raw SQL models
│   │   ├── utils/
│   │   │   ├── currency.ts      # RON conversion helpers
│   │   │   └── dates.ts
│   │   └── index.ts
│   ├── prisma/
│   │   └── schema.prisma
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                     # Shared types between client/server
│   └── types/
│       ├── tax.ts
│       ├── transaction.ts
│       └── calculation.ts
│
└── README.md
```

---

## CORE ALGORITHM: Weighted Average Cost Calculation

```typescript
interface Position {
  isin: string;
  ticker: string;
  name: string;
  totalShares: number;
  weightedAvgCostRON: number; // per share, in RON
  totalCostBasisRON: number;
}

interface RealizedGain {
  isin: string;
  ticker: string;
  sellDate: Date;
  sharesSold: number;
  proceedsRON: number;
  costBasisRON: number;
  gainLossRON: number;
}

function processTransactions(
  transactions: Transaction[], // sorted by date ascending
  bnrRates: Map<string, Map<string, number>> // date -> currency -> rate
): { positions: Position[]; gains: RealizedGain[] } {

  const positions = new Map<string, Position>();
  const gains: RealizedGain[] = [];

  for (const tx of transactions) {
    const rateToRON = getBNRRate(bnrRates, tx.date, tx.priceCurrency);
    const priceRON = tx.pricePerShare * rateToRON;

    if (tx.action === 'buy') {
      const pos = positions.get(tx.isin) || {
        isin: tx.isin,
        ticker: tx.ticker,
        name: tx.name,
        totalShares: 0,
        weightedAvgCostRON: 0,
        totalCostBasisRON: 0,
      };

      // Update weighted average cost
      const newTotalCost = pos.totalCostBasisRON + (priceRON * tx.shares);
      const newTotalShares = pos.totalShares + tx.shares;
      pos.weightedAvgCostRON = newTotalCost / newTotalShares;
      pos.totalShares = newTotalShares;
      pos.totalCostBasisRON = newTotalCost;

      positions.set(tx.isin, pos);

    } else if (tx.action === 'sell') {
      const pos = positions.get(tx.isin);
      if (!pos) throw new Error(`Selling ${tx.ticker} but no position found`);
      if (pos.totalShares < tx.shares) throw new Error(`Selling more ${tx.ticker} than owned`);

      const proceedsRON = priceRON * tx.shares;
      const costBasisRON = pos.weightedAvgCostRON * tx.shares;

      gains.push({
        isin: tx.isin,
        ticker: tx.ticker,
        sellDate: tx.date,
        sharesSold: tx.shares,
        proceedsRON,
        costBasisRON,
        gainLossRON: proceedsRON - costBasisRON,
      });

      // Update position
      pos.totalShares -= tx.shares;
      pos.totalCostBasisRON = pos.weightedAvgCostRON * pos.totalShares;

      if (pos.totalShares <= 0.0000001) { // floating point safety
        positions.delete(tx.isin);
      } else {
        positions.set(tx.isin, pos);
      }
    }
  }

  return {
    positions: Array.from(positions.values()),
    gains,
  };
}
```

---

## BNR RATE FETCHING

```typescript
// BNR provides XML with daily exchange rates
// Current: https://www.bnr.ro/nbrfxrates.xml
// Historical: https://www.bnr.ro/files/xml/years/nbrfxrates{YYYY}.xml

// Rate XML structure:
// <DataSet>
//   <Body>
//     <Cube date="2025-01-15">
//       <Rate currency="USD">4.5123</Rate>
//       <Rate currency="EUR">4.9756</Rate>
//       <Rate currency="GBP">5.6321</Rate>
//     </Cube>
//   </Body>
// </DataSet>

// IMPORTANT: BNR doesn't publish rates on weekends/holidays
// For those dates, use the LAST PUBLISHED rate (most recent business day before)
```

---

## D212 FIELD MAPPING

The user needs these specific numbers to fill in Declarația Unică:

### Capitolul I — Secțiunea 1 (Capital gains from investments)
- **1.1** — Câștiguri din transferul titlurilor de valoare (capital gains from securities transfer)
  - Venit: Total proceeds from sells (in RON)
  - Cheltuieli: Total cost basis (in RON)
  - Venit net: Net capital gain (in RON)
  - Impozit: 10% of net gain

### Capitolul I — Secțiunea 3 (Dividend income)
- **3.1** — Dividende din străinătate (foreign dividends)
  - Venit brut: Gross dividends in RON
  - Impozit plătit în străinătate: Foreign tax withheld in RON
  - Impozit datorat în România: Romanian tax owed (10% of gross minus foreign credit)

### Capitolul II — CASS
- Total venituri non-salariale: Sum of all non-salary income
- CASS datorat: Based on threshold brackets

---

## KEY TECHNICAL DECISIONS

1. **Start with SQLite** for MVP (simpler deployment, no DB server needed). Migrate to PostgreSQL when scaling.
2. **CSV parsing happens server-side** — don't trust client-side parsing for financial data.
3. **BNR rates are cached aggressively** — rates don't change once published. Fetch once, store forever.
4. **All monetary calculations use integer arithmetic** (store as RON bani × 100) to avoid floating point issues. Display as decimal.
5. **Multi-language from day 1** — Romanian primary, English secondary. Use i18n library (react-i18next).
6. **The free calculator runs entirely client-side** — no backend needed for manual input mode.

---

## DEVELOPMENT PRIORITIES

### Week 1-2: Foundation
- [ ] Project scaffolding (Vite + React + TailwindCSS + Express + TypeScript)
- [ ] Google OAuth integration
- [ ] BNR rate fetcher + cache service
- [ ] Trading212 CSV parser (the hardest part)
- [ ] Core tax calculation engine (weighted avg cost + gains)

### Week 3-4: Core Features
- [ ] CSV upload flow with progress/validation UI
- [ ] Results dashboard with per-security breakdown
- [ ] Dividend processing with foreign tax credits
- [ ] CASS calculation
- [ ] D212 field mapping helper
- [ ] Free manual calculator page

### Week 5-6: Polish + Launch
- [ ] Landing page
- [ ] PDF export of results
- [ ] Error handling + edge cases (stock splits, mergers, etc.)
- [ ] Romanian language support
- [ ] Stripe integration for paid tier
- [ ] Deploy to production
- [ ] Beta test with Romanian investing communities

---

## EDGE CASES TO HANDLE

1. **Stock splits** — Trading212 may show adjusted or unadjusted prices
2. **Fractional shares** — Trading212 supports these, calculations must handle 8+ decimal places
3. **Currency conversion fees** — Trading212 charges these, may appear as separate rows
4. **Corporate actions** — mergers, spin-offs (can defer to manual adjustment for MVP)
5. **Multiple buys at different prices** — weighted average handles this
6. **Selling more than you own** — error state, likely CSV parsing issue
7. **BNR rate gaps** — weekends/holidays, use last business day
8. **Dividend reinvestment** — treat as separate buy transaction
9. **Year boundary** — trades opened in Dec, settled in Jan
10. **Interest on uninvested cash** — Trading212 pays interest, must be declared as "dobânzi"

---

## NOTES FOR OPUS 4.6 CODE AGENT

- Dragos's stack: React, TypeScript, Node.js, Express, some Mongoose. Strong frontend, solid backend.
- He prefers practical, working code over over-engineered abstractions.
- Start with the **Trading212 CSV parser** and **tax calculation engine** — these are the core value.
- The **BNR rate service** is critical and should be built early (everything depends on RON conversion).
- For MVP, a monorepo with `/client` and `/server` directories is fine.
- He has a Claude Pro ($100) subscription for personal projects.
- The target launch window is before **March-April 2027** (when people start preparing for May 2027 D212 filing for 2026 income). But earlier is better — he could target the current cycle (May 2026 filing for 2025 income) if the MVP ships fast.
- The app language should be **Romanian primary** with English as secondary.
- The product name is TBD — "TaxeRomania", "ImpozitCalculator", "TaxeBursa", or similar.
