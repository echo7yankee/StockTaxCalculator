# StockTaxCalculator

Investment tax calculator web app. English UI, country-specific tax rules (Romania first). Upload broker CSVs, get tax-ready numbers.

## Tech Stack
- **Client:** React 18 + TypeScript + Vite + TailwindCSS (port 5173)
- **Server:** Express + TypeScript + Prisma + SQLite (port 3001)
- **Shared:** TypeScript types and tax rule configs
- **Monorepo:** npm workspaces (`client`, `server`, `shared`)

## Commands
```bash
npm run dev          # Start both client and server
npm run build        # Build all packages
npm run test         # Run all tests
npm run dev -w client   # Client only
npm run dev -w server   # Server only
```

## Project Structure
- `client/src/pages/` — Route pages (Landing, Calculator, Dashboard, Upload, Results, Settings)
- `client/src/components/layout/` — Header, Footer, Layout shell
- `client/src/contexts/` — ThemeContext (dark/light), CountryContext (geo-detected)
- `server/src/routes/` — Express API routes
- `server/src/services/` — Business logic (CSV parsers, tax engine, BNR rates)
- `shared/src/taxRules/` — Country-specific tax configs (Romania implemented)
- `shared/src/types/` — Shared TypeScript interfaces

## Key Patterns
- Dark theme default (Trading212-inspired navy blue palette)
- Country-specific tax rules via `shared/src/taxRules/` — each country exports a `CountryTaxConfig`
- TailwindCSS `darkMode: 'class'` — toggle via ThemeContext
- Vite proxies `/api` to server at localhost:3001
- Free calculator runs client-side; paid CSV processing is server-side

## Tax Logic (Romania)
- Capital gains: 10% flat on net gains, weighted average cost method
- Dividends: 10% minus foreign withholding tax credit
- CASS (health): fixed brackets based on total non-salary income
- All amounts converted to RON via BNR exchange rates on transaction date
