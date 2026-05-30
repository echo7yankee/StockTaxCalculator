import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import '../../../i18n/i18n';
import GhidLanguageNotice from '../GhidLanguageNotice';

const NOTICE_RE = /These guides are written in Romanian/i;

async function renderAt(path: string, lang: string) {
  await i18n.changeLanguage(lang);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GhidLanguageNotice />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('ro');
});

describe('GhidLanguageNotice', () => {
  it('shows the English notice on the /ghid index when UI language is English', async () => {
    await renderAt('/ghid', 'en');
    expect(screen.getByText(NOTICE_RE)).toBeInTheDocument();
  });

  it('shows the notice on an individual guide page when language is English', async () => {
    await renderAt('/ghid/declaratie-unica-ibkr', 'en');
    expect(screen.getByText(NOTICE_RE)).toBeInTheDocument();
  });

  it('renders nothing on guide routes when language is Romanian', async () => {
    await renderAt('/ghid/declaratie-unica-trading212', 'ro');
    expect(screen.queryByText(NOTICE_RE)).not.toBeInTheDocument();
  });

  it('renders nothing on non-guide routes even when language is English', async () => {
    await renderAt('/calculator', 'en');
    expect(screen.queryByText(NOTICE_RE)).not.toBeInTheDocument();
  });

  it('does not match a lookalike route like /ghidx', async () => {
    await renderAt('/ghidx', 'en');
    expect(screen.queryByText(NOTICE_RE)).not.toBeInTheDocument();
  });
});
