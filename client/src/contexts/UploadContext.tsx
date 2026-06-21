import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Transaction, TaxCalculationResult, SecurityBreakdown, PdfAuditRow, ParseResult } from '@shared/index';
import type { BrokerId } from '../lib/brokers';

interface UploadState {
  parseResult: ParseResult | null;
  parseWarnings: string[];
  transactions: Transaction[];
  taxResult: TaxCalculationResult | null;
  securities: SecurityBreakdown[];
  /** Per-trade audit rows from the PDF engine; empty for the CSV flow (its `transactions` drive the audit). */
  auditRows: PdfAuditRow[];
  /** True when the PDF net gain was taken from the statement overview total (adds an honesty note to the audit CSV). */
  pdfNetFromOverview: boolean;
  fileName: string;
  taxYear: number;
  /** Which broker produced the upload. Drives the beta verify-before-filing caveat. */
  broker: BrokerId;
}

interface UploadContextType extends UploadState {
  setUploadData: (data: Partial<UploadState>) => void;
  clearUpload: () => void;
}

const defaultState: UploadState = {
  parseResult: null,
  parseWarnings: [],
  transactions: [],
  taxResult: null,
  securities: [],
  auditRows: [],
  pdfNetFromOverview: false,
  fileName: '',
  taxYear: new Date().getFullYear() - 1,
  broker: 'trading212',
};

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UploadState>(defaultState);

  const setUploadData = (data: Partial<UploadState>) => {
    setState(prev => ({ ...prev, ...data }));
  };

  const clearUpload = () => setState(defaultState);

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
