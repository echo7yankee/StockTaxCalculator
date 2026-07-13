import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import GhidCassPage from '../GhidCassPage';
import { CountryProvider } from '../../contexts/CountryContext';

const ghidCalculatorUsed = vi.fn();
vi.mock('../../lib/analytics', () => ({
  analytics: { ghidCalculatorUsed: () => ghidCalculatorUsed() },
}));

beforeEach(() => ghidCalculatorUsed.mockClear());

function renderPage() {
  return render(
    <HelmetProvider>
      <CountryProvider>
        <MemoryRouter>
          <GhidCassPage />
        </MemoryRouter>
      </CountryProvider>
    </HelmetProvider>
  );
}

describe('GhidCassPage - crawlable conversion CTAs', () => {
  it('renders the top TL;DR CTA chip as a link to pricing', () => {
    renderPage();
    const topCta = screen.getByRole('link', { name: /Vrei calculul automat din PDF Trading212.*Vezi planuri/ });
    expect(topCta).toHaveAttribute('href', '/pricing/');
  });

  it('renders the bottom CTA pair as links (free calculator + paid PDF upload)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Calculator gratuit \(manual\)/ })).toHaveAttribute('href', '/calculator/');
    expect(screen.getByRole('link', { name: /Upload PDF \(€12 lansare\)/ })).toHaveAttribute('href', '/pricing/');
  });

  it('renders the page nav as crawlable anchors (home + back to the guides hub)', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Acasă/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Toate ghidurile/ })).toHaveAttribute('href', '/ghid/');
  });
});

describe('GhidCassPage - CASS calculator widget', () => {
  function calculate(incomeValue: string) {
    fireEvent.change(screen.getByLabelText(/Total venituri non-salariale/), { target: { value: incomeValue } });
    fireEvent.click(screen.getByRole('button', { name: /Calculează CASS/ }));
  }

  it('renders the calculator input and the calculate button', () => {
    renderPage();
    expect(screen.getByLabelText(/Total venituri non-salariale/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculează CASS/ })).toBeInTheDocument();
  });

  it('reports no CASS below the first plafon (page Example 1)', () => {
    renderPage();
    calculate('11100'); // under the 24.300 first threshold
    const result = screen.getByTestId('cass-calc-result');
    expect(within(result).getByText(/Nu datorezi CASS/)).toBeInTheDocument();
  });

  it('computes the fixed amount for the 6x plafon (page Example 2)', () => {
    renderPage();
    calculate('33500'); // 24.300-48.600 -> base 24.300, CASS 2.430
    const result = screen.getByTestId('cass-calc-result');
    expect(within(result).getByText('6 salarii minime')).toBeInTheDocument();
    expect(within(result).getByText('2.430 RON')).toBeInTheDocument();
  });

  it('computes the fixed amount for the 12x plafon (page Example 3)', () => {
    renderPage();
    calculate('51000'); // 48.600-97.200 -> base 48.600, CASS 4.860
    const result = screen.getByTestId('cass-calc-result');
    expect(within(result).getByText('12 salarii minime')).toBeInTheDocument();
    expect(within(result).getByText('4.860 RON')).toBeInTheDocument();
  });

  it('computes the fixed amount for the top (24x) plafon', () => {
    renderPage();
    calculate('120000'); // over 97.200 -> base 97.200, CASS 9.720
    const result = screen.getByTestId('cass-calc-result');
    expect(within(result).getByText('24 de salarii minime')).toBeInTheDocument();
    expect(within(result).getByText('9.720 RON')).toBeInTheDocument();
  });

  it('shows a validation hint when no income is entered', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Calculează CASS/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Introdu totalul/);
  });

  it('routes from the result to the full calculator', () => {
    renderPage();
    calculate('33500');
    const result = screen.getByTestId('cass-calc-result');
    expect(within(result).getByRole('link', { name: /calculatorul complet/ })).toHaveAttribute('href', '/calculator/');
  });

  it('beacons ghid_calculator_used on a successful calculation (incl. the no-CASS case)', () => {
    renderPage();
    calculate('11100'); // valid input, under the first plafon -> still a completed calc
    expect(ghidCalculatorUsed).toHaveBeenCalledTimes(1);
  });

  it('does not beacon when validation fails (no income entered)', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Calculează CASS/ }));
    expect(ghidCalculatorUsed).not.toHaveBeenCalled();
  });
});

describe('GhidCassPage - bracket labels match the standard RO convention', () => {
  // Audit fix: the body examples mislabeled the brackets (primul prag = 6x/24.300/
  // 2.430, al doilea = 12x/48.600/4.860, al treilea = 24x/97.200/9.720), which
  // contradicted the FAQ. Pin the corrected labels so the 2.430 example is never
  // relabeled "al doilea" again.
  it('labels the 24.300-base / 2.430 example as "primul prag", not "al doilea"', () => {
    renderPage();
    expect(screen.getByText(/Exemplul 2: primul prag/)).toBeInTheDocument();
    expect(screen.queryByText(/Exemplul 2: pragul al doilea/)).not.toBeInTheDocument();
    expect(screen.getByText(/deci în primul prag\. Baza de calcul = 24\.300 RON/)).toBeInTheDocument();
  });

  it('labels the 48.600-base / 4.860 example as "al doilea prag"', () => {
    renderPage();
    expect(screen.getByText(/deci al doilea prag\. Baza de calcul = 48\.600 RON/)).toBeInTheDocument();
  });
});
