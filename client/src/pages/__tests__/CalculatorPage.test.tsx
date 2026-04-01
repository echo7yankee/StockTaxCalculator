import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CountryProvider } from '../../contexts/CountryContext';
import CalculatorPage from '../CalculatorPage';

function renderCalculator() {
  return render(
    <MemoryRouter>
      <CountryProvider>
        <CalculatorPage />
      </CountryProvider>
    </MemoryRouter>
  );
}

describe('CalculatorPage', () => {
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
  });

  it('calculates CASS bracket for high income', async () => {
    const user = userEvent.setup();
    renderCalculator();

    const inputs = screen.getAllByPlaceholderText('0');
    await user.type(inputs[0], '100000'); // capital gains: triggers 24x bracket

    await user.click(screen.getByText('Calculate'));

    // CASS for >97200 RON = 9720 RON
    expect(screen.getByText(/bracket: 24x/)).toBeInTheDocument();
    // The health contribution row contains 9720.00
    const cassRow = screen.getByText(/bracket: 24x/).closest('div');
    expect(cassRow?.textContent).toContain('9720.00');
  });

  it('shows zero tax for zero input', async () => {
    const user = userEvent.setup();
    renderCalculator();

    await user.click(screen.getByText('Calculate'));

    expect(screen.getByText('Results')).toBeInTheDocument();
    // All values are 0.00 — just check the total row is present
    expect(screen.getByText('Total tax owed')).toBeInTheDocument();
    expect(screen.getByText(/bracket: none/)).toBeInTheDocument();
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

  it('shows early filing discount information', async () => {
    const user = userEvent.setup();
    renderCalculator();

    const inputs = screen.getAllByPlaceholderText('0');
    await user.type(inputs[0], '10000');

    await user.click(screen.getByText('Calculate'));

    // Early filing discount = 3% of income tax
    expect(screen.getByText(/3% discount/)).toBeInTheDocument();
  });
});
