import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Transaction, TaxCalculationResult, SecurityBreakdown, ParseResult } from '@shared/index';

interface UploadState {
  parseResult: ParseResult | null;
  transactions: Transaction[];
  taxResult: TaxCalculationResult | null;
  securities: SecurityBreakdown[];
  fileName: string;
  taxYear: number;
}

interface UploadContextType extends UploadState {
  setUploadData: (data: Partial<UploadState>) => void;
  clearUpload: () => void;
}

const defaultState: UploadState = {
  parseResult: null,
  transactions: [],
  taxResult: null,
  securities: [],
  fileName: '',
  taxYear: new Date().getFullYear() - 1,
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
