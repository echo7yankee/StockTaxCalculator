import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { CountryProvider } from '../../contexts/CountryContext';
import { isEarlyFilingDiscountAvailable } from '@shared/taxRules/taxYears';
import CalculatorPage from '../CalculatorPage';

// Partial mock: only the deadline gate is stubbed (deterministic regardless of
// the wall clock); the rest of the tax-year config stays real so the quick calc
// and the current-year lookup behave as in production.
vi.mock('@shared/taxRules/taxYears', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/taxRules/taxYears')>()),
  isEarlyFilingDiscountAvailable: vi.fn(() => true),
}));

function renderCalculator() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <CountryProvider>
          <CalculatorPage />
        </CountryProvider>
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('CalculatorPage', () => {
  beforeEach(() => {
    vi.mocked(isEarlyFilingDiscountAvailable).mockReturnValue(true);
  });

  it('renders the title and input fields', () => {
    renderCalculator();
    expect(screen.getByText('Tax Calculator')).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText('0')).toHaveLength(4);
    expect(screen.getByText('Calculate')).toBeInTheDocument();
  });

  it('shows results after clicking Calculate', async () => {
    const user = userEvent.setup();
    renderCalculator();

    // Fill in capital gains
    const inputs = screen.getAllByPlaceholderText('0');
    await user.type(inputs[0], '50000'); // capital gains
    await user.type(inputs[1], '1000');  // dividends
    await user.type(inputs[2], '100');   // withholding tax
    await user.type(inputs[3], '0');     // other income

    await user.click(screen.getByText('Calculate'));

    // Results should appear
    expect(screen.getByText('Results')).toBeInTheDocument();
    // Capital gains tax at 10% = 5000.00 (toFixed format, no locale commas)
    expect(screen.getByText(/5000\.00/)).toBeInTheDocument();
    // Total should be visible
    expect(screen.getByText('Total tax owed')).toBeInTheDocument();
    // Rate label shows a single percent sign — regression guard for the
    // "(10%%)" double-percent bug (code template + i18n string both added %).
    expect(screen.getByText(/Capital gains tax \(10%\)/)).toBeInTheDocument();
    expect(screen.getByText(/Dividend tax \(10% minus withholding\)/)).toBeInTheDocument();
  });

  it('calculates CASS bracket for high income', async () => {
    const user = userEvent.setup();
    renderCalculator();

    const inputs = screen.getAllByPlaceholderText('0');
    await user.type(inputs[0], '100000'); // capital gains: triggers 24x bracket

    await user.click(screen.getByText('Calculate'));

    // CASS for >97200 RON = 9720 RON
    expect(screen.getByText(/bracket: 24 minimum wages/)).toBeInTheDocument();
    // The health contribution row contains 9720.00
    const cassRow = screen.getByText(/bracket: 24 minimum wages/).closest('div');
    expect(cassRow?.textContent).toContain('9720.00');
  });

  it('shows validation error for zero input', async () => {
    const user = userEvent.setup();
    renderCalculator();

    await user.click(screen.getByText('Calculate'));

    // Validation added in PR #27: at least one non-zero input required
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Results')).not.toBeInTheDocument();
  });

  it('handles dividend tax with withholding credit', async () => {
    const user = userEvent.setup();
    renderCalculator();

    const inputs = screen.getAllByPlaceholderText('0');
    await user.type(inputs[1], '1000');  // dividends
    await user.type(inputs[2], '150');   // withholding > 10%, so no RO tax

    await user.click(screen.getByText('Calculate'));

    // Dividend tax = max(0, 1000*0.1 - 150) = 0
    expect(screen.getByText('Results')).toBeInTheDocument();
    // The dividend tax row should show 0.00
    expect(screen.getByText(/minus withholding/)).toBeInTheDocument();
  });

  it('shows early filing discount information before the deadline', async () => {
    vi.mocked(isEarlyFilingDiscountAvailable).mockReturnValue(true);
    const user = userEvent.setup();
    renderCalculator();

    const inputs = screen.getAllByPlaceholderText('0');
    await user.type(inputs[0], '10000');

    await user.click(screen.getByText('Calculate'));

    // Early filing discount = 3% of income tax
    expect(screen.getByText(/3% discount/)).toBeInTheDocument();
  });

  it('hides the early filing discount once the deadline has passed', async () => {
    // task_a9d89e13: after the bonificatie deadline (e.g. 15 Apr 2026) the 3%
    // early-filing discount is forfeited, so the free calculator must not
    // dangle a "file early to save" line the visitor can no longer act on.
    vi.mocked(isEarlyFilingDiscountAvailable).mockReturnValue(false);
    const user = userEvent.setup();
    renderCalculator();

    const inputs = screen.getAllByPlaceholderText('0');
    await user.type(inputs[0], '10000');

    await user.click(screen.getByText('Calculate'));

    // Results still render, but the discount line is gone.
    expect(screen.getByText('Results')).toBeInTheDocument();
    expect(screen.queryByText(/3% discount/)).not.toBeInTheDocument();
  });
});
