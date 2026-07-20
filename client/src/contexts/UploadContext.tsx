import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Transaction, TaxCalculationResult, SecurityBreakdown, PdfAuditRow, ParseResult, OpeningPosition, ParserWarning } from '@shared/index';
import { getCurrentTaxYearConfig } from '@shared/taxRules/taxYears';
import type { BrokerId } from '../lib/brokers';

interface UploadState {
  parseResult: ParseResult | null;
  parseWarnings: string[];
  /** The same warnings with code + severity + params, for the i18n render
   *  boundary (S6 phase B). Prose entries without a structured twin (engine
   *  warnings, pre-phase-A stashes) render verbatim; see parserWarningText.ts. */
  parseStructuredWarnings: ParserWarning[];
  transactions: Transaction[];
  taxResult: TaxCalculationResult | null;
  /** The withholding-credit-corrected result the user sees on Results after entering a
   *  foreign dividend credit. Written back from ResultsPage so downstream surfaces (the
   *  Filing Guide's D212 copy-paste values + PDF export) show the SAME credited dividend
   *  tax + total, never the un-credited `taxResult`. Null when no credit is applied, so
   *  the clean parse / PDF flow is untouched and consumers fall back to `taxResult`. */
  correctedTaxResult: TaxCalculationResult | null;
  securities: SecurityBreakdown[];
  /** Per-trade audit rows from the PDF engine; empty for the CSV flow (its `transactions` drive the audit). */
  auditRows: PdfAuditRow[];
  /** True when the PDF net gain was taken from the statement overview total (adds an honesty note to the audit CSV). */
  pdfNetFromOverview: boolean;
  fileName: string;
  taxYear: number;
  /** Which broker produced the upload. Drives the beta verify-before-filing caveat. */
  broker: BrokerId;
  /** Prior-year positions that seeded cost basis on the CSV flow (board #3 carry-forward),
   *  after the double-count guard. Empty when nothing was carried. Surfaced on Results
   *  so a carried cost basis is never silent. */
  carriedPositions: OpeningPosition[];
  /** The prior filing year the carried positions came from; null when nothing was carried. */
  carryForwardYear: number | null;
}

interface UploadContextType extends UploadState {
  setUploadData: (data: Partial<UploadState>) => void;
  clearUpload: () => void;
}

// Built fresh on each provider mount / clearUpload so the default tax year is
// evaluated against the current clock, not frozen at module-load time. The
// default uses getCurrentTaxYearConfig().taxYear (the same filing-window-aware,
// engine-supported source the rest of the app reads: Footer, CalculatorPage,
// prerender) rather than a naive getFullYear()-1. That matters at the Jan
// rollover: bare getFullYear()-1 (and even getCurrentTaxYear()) would return a
// dormant year that isEngineSupportedTaxYear() reports false, blocking the
// default upload flow until the user re-picked a supported year.
// getCurrentTaxYearConfig() falls back to the latest engine-supported year, so
// the default can never be a dormant year.
function createDefaultState(): UploadState {
  return {
    parseResult: null,
    parseWarnings: [],
    parseStructuredWarnings: [],
    transactions: [],
    taxResult: null,
    correctedTaxResult: null,
    securities: [],
    auditRows: [],
    pdfNetFromOverview: false,
    fileName: '',
    taxYear: getCurrentTaxYearConfig().taxYear,
    broker: 'trading212',
    carriedPositions: [],
    carryForwardYear: null,
  };
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UploadState>(createDefaultState);

  const setUploadData = (data: Partial<UploadState>) => {
    setState(prev => ({ ...prev, ...data }));
  };

  const clearUpload = () => setState(createDefaultState());

  return (
    <UploadContext.Provider value={{ ...state, setUploadData, clearUpload }}>
      {children}
    </UploadContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUpload() {
  const context = useContext(UploadContext);
  if (!context) throw new Error('useUpload must be used within UploadProvider');
  return context;
}
