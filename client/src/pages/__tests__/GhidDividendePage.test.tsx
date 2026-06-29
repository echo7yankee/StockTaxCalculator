import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import GhidDividendePage from '../GhidDividendePage';
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
          <GhidDividendePage />
        </MemoryRouter>
      </CountryProvider>
    </HelmetProvider>
  );
}

describe('GhidDividendePage - crawlable conversion CTAs', () => {
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

describe('GhidDividendePage - dividend calculator widget', () => {
  function calculate(grossValue: string, withheldValue: string) {
    fireEvent.change(screen.getByLabelText(/Dividend brut/), { target: { value: grossValue } });
    fireEvent.change(screen.getByLabelText(/Reținere străină/), { target: { value: withheldValue } });
    fireEvent.click(screen.getByRole('button', { name: /Calculează impozitul/ }));
  }

  it('renders the calculator inputs and the calculate button', () => {
    renderPage();
    expect(screen.getByLabelText(/Dividend brut/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reținere străină/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calculează impozitul/ })).toBeInTheDocument();
  });

  it('computes the dividend tax with a partial foreign credit', () => {
    renderPage();
    calculate('1000', '40');
    // 10% of 1000 = 100 gross tax; credit 40; owed 60.
    expect(screen.getByText('100,00 RON')).toBeInTheDocument();
    expect(screen.getByText('-40,00 RON')).toBeInTheDocument();
    expect(screen.getByText('60,00 RON')).toBeInTheDocument();
  });

  it('caps the foreign credit at the Romanian tax so nothing is owed when withholding exceeds it', () => {
    renderPage();
    calculate('1000', '150');
    // Credit capped at the 100 RON Romanian tax; owed 0.
    expect(screen.getByText('-100,00 RON')).toBeInTheDocument();
    expect(screen.getByText('0,00 RON')).toBeInTheDocument();
  });

  it('shows a zero credit without a misleading minus sign when no foreign tax was withheld', () => {
    renderPage();
    calculate('1000', '0');
    // 10% of 1000 = 100 gross tax, nothing withheld -> credit 0, full 100 owed.
    expect(screen.getByText('0,00 RON')).toBeInTheDocument();
    expect(screen.queryByText('-0,00 RON')).not.toBeInTheDocument();
  });

  it('routes from the result to the full calculator for CASS', () => {
    renderPage();
    calculate('500', '0');
    expect(screen.getByRole('link', { name: /calculatorul complet cu CASS/ })).toHaveAttribute('href', '/calculator/');
  });

  it('shows a validation hint when no gross amount is entered', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Calculează impozitul/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Introdu suma brută/);
  });

  it('beacons ghid_calculator_used on a successful calculation', () => {
    renderPage();
    calculate('1000', '0');
    expect(ghidCalculatorUsed).toHaveBeenCalledTimes(1);
  });

  it('does not beacon when validation fails (no gross amount)', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Calculează impozitul/ }));
    expect(ghidCalculatorUsed).not.toHaveBeenCalled();
  });
});
