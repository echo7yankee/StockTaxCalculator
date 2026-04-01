import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { UploadProvider, useUpload } from '../UploadContext';
import type { TaxCalculationResult, SecurityBreakdown } from '@shared/index';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <UploadProvider>{children}</UploadProvider>
);

describe('UploadContext', () => {
  it('provides default state', () => {
    const { result } = renderHook(() => useUpload(), { wrapper });
    expect(result.current.parseResult).toBeNull();
    expect(result.current.transactions).toEqual([]);
    expect(result.current.taxResult).toBeNull();
    expect(result.current.securities).toEqual([]);
    expect(result.current.fileName).toBe('');
    expect(result.current.taxYear).toBe(new Date().getFullYear() - 1);
  });

  it('setUploadData merges partial state', () => {
    const { result } = renderHook(() => useUpload(), { wrapper });

    act(() => {
      result.current.setUploadData({ fileName: 'test.pdf', taxYear: 2025 });
    });

    expect(result.current.fileName).toBe('test.pdf');
    expect(result.current.taxYear).toBe(2025);
    // Other fields unchanged
    expect(result.current.taxResult).toBeNull();
  });

  it('setUploadData can set taxResult and securities', () => {
    const { result } = renderHook(() => useUpload(), { wrapper });

    const mockTaxResult = {
      taxYearId: '2025',
      capitalGains: { totalProceeds: 100, totalCostBasis: 50, netGains: 50, losses: 0, taxRate: 0.1, taxOwed: 5 },
      dividends: { grossTotal: 10, withholdingTaxPaid: 1, taxOwed: 0 },
      healthContribution: { totalNonSalaryIncome: 60, thresholdHit: 'none', amountOwed: 0 },
      totals: { totalTaxOwed: 5, earlyFilingDiscount: 0.15, totalAfterDiscount: 4.85 },
      calculatedAt: new Date(),
    } as TaxCalculationResult;

    const mockSecurities: SecurityBreakdown[] = [{
      isin: 'US0', ticker: 'TEST', securityName: 'Test Inc',
      totalBoughtShares: 10, totalSoldShares: 5, remainingShares: 5,
      weightedAvgCostLocal: 10, totalProceeds: 100, totalCostBasis: 50,
      realizedGainLoss: 50, totalDividends: 10, totalWithholdingTax: 1,
    }];

    act(() => {
      result.current.setUploadData({ taxResult: mockTaxResult, securities: mockSecurities });
    });

    expect(result.current.taxResult).toBe(mockTaxResult);
    expect(result.current.securities).toBe(mockSecurities);
  });

  it('clearUpload resets to defaults', () => {
    const { result } = renderHook(() => useUpload(), { wrapper });

    act(() => {
      result.current.setUploadData({ fileName: 'test.pdf', taxYear: 2020 });
    });

    expect(result.current.fileName).toBe('test.pdf');

    act(() => {
      result.current.clearUpload();
    });

    expect(result.current.fileName).toBe('');
    expect(result.current.taxYear).toBe(new Date().getFullYear() - 1);
  });

  it('throws when useUpload is called outside provider', () => {
    expect(() => {
      renderHook(() => useUpload());
    }).toThrow('useUpload must be used within UploadProvider');
  });
});
