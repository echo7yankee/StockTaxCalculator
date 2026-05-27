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
      screen.getByText(/BNR annual average exchange rate/i, { exact: false })
    ).toBeInTheDocument();
  });

  it('renders the inline link pointing at the methodology ghid page', () => {
    renderFooter();
    const link = screen.getByRole('link', { name: 'How we calculate' });
    expect(link).toHaveAttribute('href', '/ghid/cum-calculam');
  });

  it('keeps the existing legal/admin link cluster intact', () => {
    renderFooter();
    expect(screen.getByRole('link', { name: 'Guides' })).toHaveAttribute('href', '/ghid');
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact');
  });
});
