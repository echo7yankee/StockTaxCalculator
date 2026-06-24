import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CountryProvider } from '../../../contexts/CountryContext';
import EmbedCalculator, { type EmbedTheme } from '../EmbedCalculator';

const embedCalculatorUsed = vi.fn();
vi.mock('../../../lib/analytics', () => ({
  analytics: { embedCalculatorUsed: () => embedCalculatorUsed() },
}));

function renderWidget(theme?: EmbedTheme) {
  return render(
    <CountryProvider>
      <EmbedCalculator theme={theme} />
    </CountryProvider>,
  );
}

const fill = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const calc = () => fireEvent.click(screen.getByRole('button', { name: /Calculează impozitul/ }));
/** The flex row holding a result line, located by its label, so each amount is
 *  asserted in its own row (identical RON amounts can appear on several lines). */
const row = (labelRe: RegExp) => within(screen.getByRole('status')).getByText(labelRe).closest('div')!;

beforeEach(() => embedCalculatorUsed.mockClear());

describe('EmbedCalculator', () => {
  it('renders the four inputs and the calculate button', () => {
    renderWidget();
    expect(screen.getByLabelText(/Câștig net din titluri/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Dividende brute/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reținere străină/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Alte venituri non-salariale/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculează impozitul/ })).toBeInTheDocument();
  });

  it('computes 10% on gains and dividends with no CASS below the first plafon', () => {
    renderWidget();
    fill(/Câștig net din titluri/, '10000');
    fill(/Dividende brute/, '2000');
    calc();
    expect(within(row(/Impozit câștiguri/)).getByText('1000,00 RON')).toBeInTheDocument();
    expect(within(row(/Impozit dividende/)).getByText('200,00 RON')).toBeInTheDocument();
    expect(within(row(/CASS/)).getByText(/sub primul prag/)).toBeInTheDocument();
    expect(within(row(/Total estimat/)).getByText('1200,00 RON')).toBeInTheDocument();
  });

  it('nets the foreign withholding credit against the dividend tax', () => {
    renderWidget();
    fill(/Dividende brute/, '1000');
    fill(/Reținere străină/, '30');
    calc();
    // 10% of 1000 = 100, minus 30 already withheld at source = 70 owed in RO.
    expect(within(row(/Impozit dividende/)).getByText('70,00 RON')).toBeInTheDocument();
  });

  it('adds the fixed CASS amount for the 6x plafon and sums it into the total', () => {
    renderWidget();
    fill(/Câștig net din titluri/, '30000'); // in [24.300, 48.600) -> 6x plafon
    calc();
    expect(within(row(/CASS/)).getByText(/6 salarii minime/)).toBeInTheDocument();
    expect(within(row(/CASS/)).getByText('2430,00 RON')).toBeInTheDocument();
    expect(within(row(/Total estimat/)).getByText('5430,00 RON')).toBeInTheDocument(); // 3000 + 2430
  });

  it('shows a validation message and does not compute when no income is entered', () => {
    renderWidget();
    calc();
    expect(screen.getByRole('alert')).toHaveTextContent(/Completează cel puțin/);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(embedCalculatorUsed).not.toHaveBeenCalled();
  });

  it('beacons embed_calculator_used only on a successful calculation', () => {
    renderWidget();
    fill(/Câștig net din titluri/, '5000');
    calc();
    expect(embedCalculatorUsed).toHaveBeenCalledTimes(1);
  });

  it('links back to the product with absolute URLs that open outside the iframe', () => {
    renderWidget();
    const verify = screen.getByRole('link', { name: /Verifică-ți extrasul complet/ });
    expect(verify).toHaveAttribute('href', 'https://investax.app/verifica-extras');
    expect(verify).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: /^InvesTax/ })).toHaveAttribute('href', 'https://investax.app');
    expect(screen.getByRole('link', { name: /Calculator complet/ })).toHaveAttribute(
      'href',
      'https://investax.app/calculator',
    );
  });

  it('applies the light theme by default and the dark theme on request', () => {
    const { container, rerender } = renderWidget('light');
    expect(container.querySelector('.text-gray-900')).toBeTruthy();
    rerender(
      <CountryProvider>
        <EmbedCalculator theme="dark" />
      </CountryProvider>,
    );
    expect(container.querySelector('.text-slate-100')).toBeTruthy();
  });
});
