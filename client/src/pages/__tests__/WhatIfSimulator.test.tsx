import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { CountryProvider } from '../../contexts/CountryContext';
import CalculatorPage from '../CalculatorPage';

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

/**
 * Fills the 4 what-if inputs for one scenario column. The what-if inputs render
 * AFTER the 4 main-calculator inputs, so with the panel open the placeholders
 * are: [main 0-3], [scenario A 0-3], [scenario B 0-3].
 */
async function fillScenario(
  user: ReturnType<typeof userEvent.setup>,
  offset: number,
  values: [string, string, string, string]
) {
  const inputs = screen.getAllByPlaceholderText('0');
  for (let i = 0; i < 4; i++) {
    if (values[i] !== '') await user.type(inputs[offset + i], values[i]);
  }
}

describe('WhatIfSimulator', () => {
  it('does not mount the what-if inputs until the toggle is clicked', () => {
    renderCalculator();
    // Only the 4 main-calculator inputs exist by default.
    expect(screen.getAllByPlaceholderText('0')).toHaveLength(4);
    expect(screen.queryByText('Scenario A')).not.toBeInTheDocument();
  });

  it('reveals the two scenario columns when the toggle is clicked', async () => {
    const user = userEvent.setup();
    renderCalculator();

    await user.click(screen.getByText('Compare two scenarios'));

    expect(screen.getByText('Scenario A')).toBeInTheDocument();
    expect(screen.getByText('Scenario B')).toBeInTheDocument();
    // 4 main + 4 scenario A + 4 scenario B.
    expect(screen.getAllByPlaceholderText('0')).toHaveLength(12);
  });

  it('renders both totals and a correct difference after Compare', async () => {
    const user = userEvent.setup();
    renderCalculator();

    await user.click(screen.getByText('Compare two scenarios'));
    // A: cap gains 30000 -> tax 3000, bracket 6x (CASS 2430), total 5430.
    await fillScenario(user, 4, ['30000', '', '', '']);
    // B: cap gains 45000 -> tax 4500, same 6x bracket (CASS 2430), total 6930.
    await fillScenario(user, 8, ['45000', '', '', '']);

    await user.click(screen.getByText('Compare'));

    expect(screen.getByText(/5430\.00/)).toBeInTheDocument();
    expect(screen.getByText(/6930\.00/)).toBeInTheDocument();
    // Difference B - A on total = +1500.00 (the cap-gains-tax row also shifts
    // by exactly +1500, so both the tax row and the total row carry it).
    expect(screen.getAllByText(/\+1500\.00/).length).toBeGreaterThan(0);
    // Same bracket -> no cliff callout.
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('shows the CASS cliff callout with the correct lump difference across a bracket', async () => {
    const user = userEvent.setup();
    renderCalculator();

    await user.click(screen.getByText('Compare two scenarios'));
    // A: cap gains 40000 -> bracket 6x, CASS 2430.
    await fillScenario(user, 4, ['40000', '', '', '']);
    // B: cap gains 100000 -> bracket 24x, CASS 9720.
    await fillScenario(user, 8, ['100000', '', '', '']);

    await user.click(screen.getByText('Compare'));

    const callout = screen.getByRole('note');
    expect(callout).toBeInTheDocument();
    // CASS lump difference = 9720 - 2430 = 7290.00, B is the higher bracket.
    expect(callout.textContent).toContain('7290.00');
    expect(callout.textContent).toContain('Scenario B');
    expect(callout.textContent).toContain('24 minimum wages');
  });

  it('shows a zero total difference and no callout for two identical scenarios', async () => {
    const user = userEvent.setup();
    renderCalculator();

    await user.click(screen.getByText('Compare two scenarios'));
    await fillScenario(user, 4, ['50000', '', '', '']);
    await fillScenario(user, 8, ['50000', '', '', '']);

    await user.click(screen.getByText('Compare'));

    // Total difference is +0.00 (no sign prefix for zero: renders "0.00").
    const differenceCells = screen.getAllByText(/^0\.00 RON$/);
    expect(differenceCells.length).toBeGreaterThan(0);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('shows a validation error and no comparison when both scenarios are empty', async () => {
    const user = userEvent.setup();
    renderCalculator();

    await user.click(screen.getByText('Compare two scenarios'));
    await user.click(screen.getByText('Compare'));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    // No comparison rendered: the difference column header is absent.
    expect(screen.queryByText('Difference (B minus A)')).not.toBeInTheDocument();
  });
});
