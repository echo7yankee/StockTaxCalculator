import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Footer from '../Footer';

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>
  );
}

describe('Footer: methodology link', () => {
  it('renders the methodology disclaimer body inline with the link', () => {
    renderFooter();
    expect(
      screen.getByText(/BNR rate on each transaction date/i, { exact: false })
    ).toBeInTheDocument();
  });

  it('renders the inline link pointing at the methodology ghid page', () => {
    renderFooter();
    const link = screen.getByRole('link', { name: 'Methodology' });
    expect(link).toHaveAttribute('href', '/ghid/cum-calculam/');
  });

  it('keeps the existing legal/admin link cluster intact', () => {
    renderFooter();
    expect(screen.getByRole('link', { name: 'Guides' })).toHaveAttribute('href', '/ghid/');
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy/');
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms/');
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact/');
  });
});

describe('Footer: year-dynamic disclaimer interpolation', () => {
  // Verifies the i18n template variables resolve against TAX_YEARS via getCurrentTaxYearConfig.
  // While only 2025 is in TAX_YEARS, the rendered strings must match the pre-templatization copy.

  it('interpolates the current taxYear and filingDeadline into the legal disclaimer', () => {
    renderFooter();
    expect(
      screen.getByText(/Romanian tax legislation valid for tax year 2025 \(declaration filed by May 25, 2026\)/i)
    ).toBeInTheDocument();
  });

  it('interpolates current and next year tokens into the tax-year disclaimer', () => {
    renderFooter();
    expect(
      screen.getByText(
        /Calculator valid for tax year 2025 \(declaration filed by May 25, 2026\)\. For tax year 2026 and later, the tax rate changes per Law 239\/2025\. InvesTax will be updated before the 2027 filing season\./i
      )
    ).toBeInTheDocument();
  });
});
