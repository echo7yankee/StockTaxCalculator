import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TaxCalculationResult, SecurityBreakdown } from '@shared/index';
import D212Download from '../D212Download';
import { analytics } from '../../lib/analytics';

// A self-consistent gain-year result: the per-security sums reconcile with the
// engine totals, and the single security is US, so generateD212Xml succeeds.
const goodResult: TaxCalculationResult = {
  taxYearId: '2025',
  capitalGains: { totalProceeds: 5000, totalCostBasis: 4000, netGains: 1000, losses: 0, taxRate: 0.1, taxOwed: 100 },
  dividends: { grossTotal: 200, taxBeforeCredit: 20, withholdingTaxPaid: 20, foreignTaxCredit: 20, taxOwed: 0, taxRate: 0.1 },
  healthContribution: { totalNonSalaryIncome: 1200, thresholdHit: 'none', amountOwed: 0 },
  totals: { totalTaxOwed: 100, earlyFilingDiscount: 0, totalAfterDiscount: 100 },
  calculatedAt: new Date('2025-03-01'),
};

const goodSecurities: SecurityBreakdown[] = [
  {
    isin: 'US0000000001', ticker: 'AAA', securityName: 'Alpha Corp',
    totalBoughtShares: 10, totalSoldShares: 10, remainingShares: 0,
    weightedAvgCostLocal: 400, totalProceeds: 5000, totalCostBasis: 4000,
    realizedGainLoss: 1000, totalDividends: 200, totalWithholdingTax: 20,
  },
];

// A net capital-loss year: the generator fails loud (loss carry-forward unsupported).
const lossResult: TaxCalculationResult = {
  ...goodResult,
  capitalGains: { ...goodResult.capitalGains, netGains: 0, losses: 500, taxOwed: 0 },
};

// A 2023-income result (8% dividends, no bonificatie) for the past-year form path.
const past2023Result: TaxCalculationResult = {
  ...goodResult,
  taxYearId: '2023',
  dividends: { ...goodResult.dividends, taxBeforeCredit: 16, foreignTaxCredit: 16, taxRate: 0.08 },
};

async function fillValidIdentity(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Surname/), 'Popescu');
  await user.type(screen.getByLabelText(/Given name/), 'Ion');
  await user.type(screen.getByLabelText(/Phone/), '0712345678');
  await user.type(screen.getByLabelText(/CNP/), '1960315123451');
  await user.type(screen.getByLabelText(/IBAN/), 'RO49AAAA1B31007593840000');
}

describe('D212Download', () => {
  beforeEach(() => {
    // happy-dom may not implement URL.createObjectURL; define + spy so we can
    // capture the generated blob, and stub the anchor click to avoid navigation.
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(analytics, 'd212Downloaded').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render for an unsupported tax year (2022 pre-CMP, 2026 unvalidated)', () => {
    render(<D212Download result={goodResult} securities={goodSecurities} taxYear={2026} />);
    expect(screen.queryByTestId('d212-download')).not.toBeInTheDocument();
    render(<D212Download result={goodResult} securities={goodSecurities} taxYear={2022} />);
    expect(screen.queryByTestId('d212-download')).not.toBeInTheDocument();
  });

  it('renders for past years with the form-version note; 2025 shows no note and no address field', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <D212Download result={past2023Result} securities={goodSecurities} taxYear={2023} />,
    );
    expect(screen.getByTestId('d212-download')).toBeInTheDocument();
    const note = screen.getByTestId('d212-past-year-note');
    // Which season's form + the original-vs-rectificativa warning.
    expect(note).toHaveTextContent('income year 2023');
    expect(note).toHaveTextContent('2024 filing-season version');
    expect(note).toHaveTextContent(/already filed/i);
    await user.click(screen.getByTestId('d212-open'));
    expect(screen.getByLabelText(/Address/)).toBeInTheDocument();
    unmount();

    render(<D212Download result={goodResult} securities={goodSecurities} taxYear={2025} />);
    expect(screen.queryByTestId('d212-past-year-note')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('d212-open'));
    expect(screen.queryByLabelText(/Address/)).not.toBeInTheDocument();
  });

  it('requires the address for a past year and embeds it in the v9 XML on success', async () => {
    const user = userEvent.setup();
    render(<D212Download result={past2023Result} securities={goodSecurities} taxYear={2023} />);
    await user.click(screen.getByTestId('d212-open'));
    await fillValidIdentity(user);
    // Address left empty: submit must be blocked with a required error.
    await user.click(screen.getByTestId('d212-submit'));
    expect(screen.getByText('This field is required.')).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Address/), 'Str. Exemplu Nr. 1, Arad');
    await user.click(screen.getByTestId('d212-submit'));
    await waitFor(() => expect(screen.getByTestId('d212-success')).toBeInTheDocument());

    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    const xml = await blob.text();
    // Season-2024 form: v9 namespace, an_r 2024, single joined name + address.
    expect(xml).toContain('mfp:anaf:dgti:d212:declaratie:v9');
    expect(xml).toContain('an_r="2024"');
    expect(xml).toContain('nume_c="Popescu Ion"');
    expect(xml).toContain('adresa_c="Str. Exemplu Nr. 1, Arad"');
    expect(xml).not.toContain('den_stat');
  });

  it('renders the open CTA for 2025 and reveals the form on click', async () => {
    const user = userEvent.setup();
    render(<D212Download result={goodResult} securities={goodSecurities} taxYear={2025} />);
    expect(screen.getByTestId('d212-download')).toBeInTheDocument();
    expect(screen.queryByTestId('d212-form')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('d212-open'));
    expect(screen.getByTestId('d212-form')).toBeInTheDocument();
    expect(screen.getByTestId('d212-privacy')).toBeInTheDocument();
  });

  it('shows required-field errors on an empty submit and does not download', async () => {
    const user = userEvent.setup();
    render(<D212Download result={goodResult} securities={goodSecurities} taxYear={2025} />);
    await user.click(screen.getByTestId('d212-open'));
    await user.click(screen.getByTestId('d212-submit'));

    // Surname, given name, phone, CNP, IBAN all required (initial is optional).
    expect(screen.getAllByText('This field is required.')).toHaveLength(5);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(analytics.d212Downloaded).not.toHaveBeenCalled();
  });

  it('shows format errors for an invalid CNP and IBAN', async () => {
    const user = userEvent.setup();
    render(<D212Download result={goodResult} securities={goodSecurities} taxYear={2025} />);
    await user.click(screen.getByTestId('d212-open'));
    await user.type(screen.getByLabelText(/Surname/), 'Popescu');
    await user.type(screen.getByLabelText(/Given name/), 'Ion');
    await user.type(screen.getByLabelText(/Phone/), '0712345678');
    await user.type(screen.getByLabelText(/CNP/), '123');
    await user.type(screen.getByLabelText(/IBAN/), 'GB82WEST12345698765432');
    await user.click(screen.getByTestId('d212-submit'));

    expect(screen.getByText(/Invalid CNP/)).toBeInTheDocument();
    expect(screen.getByText(/Invalid IBAN/)).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('generates a valid D212 XML, downloads it, and fires the analytics event', async () => {
    const user = userEvent.setup();
    render(<D212Download result={goodResult} securities={goodSecurities} taxYear={2025} />);
    await user.click(screen.getByTestId('d212-open'));
    await fillValidIdentity(user);
    await user.click(screen.getByTestId('d212-submit'));

    await waitFor(() => expect(screen.getByTestId('d212-success')).toBeInTheDocument());

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(analytics.d212Downloaded).toHaveBeenCalledTimes(1);

    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    const xml = await blob.text();
    expect(xml).toContain('mfp:anaf:dgti:d212:declaratie:v11');
    expect(xml).toContain('cif="1960315123451"');
    expect(xml).toContain('cont_bancar="RO49AAAA1B31007593840000"');
    expect(xml).toContain('nume_c="Popescu"');
    // One US capital-gains row (code 2012) for the single US security.
    expect(xml).toContain('str_stat_realiz_v="US"');
  });

  it('shows a friendly error (no download) when the generator fails loud on a loss year', async () => {
    const user = userEvent.setup();
    render(<D212Download result={lossResult} securities={goodSecurities} taxYear={2025} />);
    await user.click(screen.getByTestId('d212-open'));
    await fillValidIdentity(user);
    await user.click(screen.getByTestId('d212-submit'));

    await waitFor(() => expect(screen.getByTestId('d212-gen-error')).toBeInTheDocument());
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(analytics.d212Downloaded).not.toHaveBeenCalled();
    expect(screen.queryByTestId('d212-success')).not.toBeInTheDocument();
  });
});
