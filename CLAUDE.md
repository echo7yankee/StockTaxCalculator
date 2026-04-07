# InvesTax

Investment tax calculator web app. English UI, country-specific tax rules (Romania first). Upload broker CSVs, get tax-ready numbers.

## Tech Stack
- **Client:** React 18 + TypeScript + Vite + TailwindCSS (port 5173)
- **Server:** Express + TypeScript + Prisma + SQLite (port 3001)
- **Shared:** TypeScript types, tax rule configs, and shared engines
- **Monorepo:** npm workspaces (`client`, `server`, `shared`)
- **Validation:** Zod (server-side input validation)
- **Security:** express-rate-limit (auth + general API rate limiting)

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
- `shared/src/engine/` — Shared calculation engines (taxCalculator, pdfTaxCalculator, quickCalculator)
- `shared/src/taxRules/` — Country-specific tax configs (Romania implemented)
- `shared/src/types/` — Shared TypeScript interfaces
- `e2e/` — Playwright E2E tests

## Key Patterns
- Dark theme default (Trading212-inspired navy blue palette)
- Country-specific tax rules via `shared/src/taxRules/` — each country exports a `CountryTaxConfig`
- TailwindCSS `darkMode: 'class'` — toggle via ThemeContext
- Vite proxies `/api` to server at localhost:3001
- Free calculator runs client-side; paid CSV processing is server-side
- Quick tax calculation logic lives in `shared/src/engine/quickCalculator.ts` — used by both client and server
- Prisma schema uses cascade deletes on all relations
- `CLIENT_URL` env var controls CORS origin and OAuth redirects (defaults to `http://localhost:5173`)
- Rate limiting: auth endpoints (5 signup/10 login per 15min in prod), general API (100 req/15min in prod)

## Tax Logic (Romania)
- Capital gains: 10% flat on net gains, weighted average cost method
- Dividends: 10% minus foreign withholding tax credit
- CASS (health): fixed brackets based on total non-salary income
- All amounts converted to RON via BNR exchange rates on transaction date
