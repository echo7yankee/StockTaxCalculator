/**
 * Unit tests for the anonymize-pdf-pages script's pure transform function.
 *
 * The script is a CLI utility that takes an already-extracted T212 PDF page-text
 * JSON, strips customer identifying information, and writes the result. This
 * test exercises the pure `anonymizePages` function in isolation; the CLI
 * wrapper (argv parsing, file IO) is intentionally not covered here.
 */
import { describe, it, expect } from 'vitest';
import { anonymizePages } from '../anonymize-pdf-pages.js';

describe('anonymizePages', () => {
  it('replaces the customer line that follows a "CUSTOMER ID\\tCUSTOMER NAME" header', () => {
    const input = [
      'CUSTOMER ID\tCUSTOMER NAME\n6456112\tDragos-Cosmin Ifrim\nAnnual Statement - 2025',
    ];
    const { pages, replacements } = anonymizePages(input);
    expect(pages[0]).toContain('99999999\tAnonymized User');
    expect(pages[0]).not.toContain('6456112');
    expect(pages[0]).not.toContain('Dragos-Cosmin Ifrim');
    expect(replacements.customerLines).toBe(1);
  });

  it('replaces the customer line that follows the Romanian header "ID CLIENT\\tNUME CLIENT"', () => {
    const input = [
      'ID CLIENT\tNUME CLIENT\n7891234\tPop Florin\nDeclarație anuală - 2025',
    ];
    const { pages, replacements } = anonymizePages(input);
    expect(pages[0]).toContain('99999999\tAnonymized User');
    expect(pages[0]).not.toContain('Pop Florin');
    expect(pages[0]).not.toContain('7891234');
    expect(replacements.customerLines).toBe(1);
  });

  it('replaces the customer line that follows the newer Romanian header "IDENTIFICARE CLIENT\\tNUMELE CLIENTULUI"', () => {
    // Observed on Paul Adam's 2025 statement: T212 uses a different Romanian
    // header phrasing than the older "ID CLIENT / NUME CLIENT" variant.
    const input = [
      'IDENTIFICARE CLIENT\tNUMELE CLIENTULUI\n10800681\tPaul-Alexandru Adam\nDeclarație anuală - 2025',
    ];
    const { pages, replacements } = anonymizePages(input);
    expect(pages[0]).toContain('99999999\tAnonymized User');
    expect(pages[0]).not.toContain('Paul-Alexandru Adam');
    expect(pages[0]).not.toContain('10800681');
    expect(replacements.customerLines).toBe(1);
  });

  it('replaces "ID cont:" (Romanian newer variant) with the same placeholder scheme', () => {
    // Paul Adam's 2025 statement uses "ID cont: 21223423" instead of the older
    // "Cont nr." variant.
    const input = ['ID cont: 21223423\nPrezentare generală'];
    const { pages, replacements } = anonymizePages(input);
    expect(pages[0]).toContain('ID cont: 11111');
    expect(pages[0]).not.toContain('21223423');
    expect(replacements.accountIds).toBe(1);
  });

  it('replaces "Account ID: NNNN" with a sequential placeholder', () => {
    const input = ['Account ID: 3688075\nOverview'];
    const { pages, replacements } = anonymizePages(input);
    expect(pages[0]).toContain('Account ID: 11111');
    expect(pages[0]).not.toContain('3688075');
    expect(replacements.accountIds).toBe(1);
    expect(replacements.uniqueAccountIds).toBe(1);
  });

  it('replaces "Cont nr." (Romanian) with the same placeholder scheme', () => {
    const input = ['Cont nr.: 12345\nPrezentare generală'];
    const { pages, replacements } = anonymizePages(input);
    expect(pages[0]).toContain('Cont nr.: 11111');
    expect(pages[0]).not.toContain('12345');
    expect(replacements.accountIds).toBe(1);
  });

  it('keeps the same placeholder for repeated occurrences of the same account ID', () => {
    const input = [
      'Account ID: 3688075\nPage 1',
      'Account ID: 3688075\nPage 2',
    ];
    const { pages, replacements } = anonymizePages(input);
    expect(pages[0]).toContain('Account ID: 11111');
    expect(pages[1]).toContain('Account ID: 11111');
    expect(replacements.accountIds).toBe(2);
    expect(replacements.uniqueAccountIds).toBe(1);
  });

  it('handles the multi-account horizontal layout (3 distinct account IDs on one line)', () => {
    const input = [
      'Trading 212 Invest\tTrading 212 CFD\tTrading 212 Crypto\nAccount ID: 1111\tAccount ID: 2222\tAccount ID: 3333',
    ];
    const { pages, replacements } = anonymizePages(input);
    expect(pages[0]).toContain('Account ID: 11111\tAccount ID: 22222\tAccount ID: 33333');
    expect(replacements.accountIds).toBe(3);
    expect(replacements.uniqueAccountIds).toBe(3);
  });

  it('preserves ISINs, prices, currencies, dates, and gain/loss numbers', () => {
    const input = [
      'CUSTOMER ID\tCUSTOMER NAME\n6456112\tDragos-Cosmin Ifrim\nAnnual Statement - 2025',
      '15.04.2025 10:30\tApple Inc.\tUS0378331005\tStock\tUSD\t100\t150.00\t250.00\t1.0000\tUSD\t250.00\t10,000.00',
    ];
    const { pages } = anonymizePages(input);
    // Financial fields untouched.
    expect(pages[1]).toContain('Apple Inc.');
    expect(pages[1]).toContain('US0378331005');
    expect(pages[1]).toContain('15.04.2025 10:30');
    expect(pages[1]).toContain('250.00');
    expect(pages[1]).toContain('10,000.00');
    expect(pages[1]).toContain('USD');
  });

  it('preserves T212 legal address text (corporate boilerplate, not PII)', () => {
    const input = [
      'Trading 212 UK Ltd. is registered in England and Wales (Company number 08590005). Registered address: Aldermary House, 10-15 Queen Street, London, EC4N 1TX.',
    ];
    const { pages } = anonymizePages(input);
    expect(pages[0]).toContain('Trading 212 UK Ltd.');
    expect(pages[0]).toContain('Aldermary House');
    expect(pages[0]).toContain('Queen Street');
  });

  it('does not over-match: lines that mention "ID" elsewhere are untouched', () => {
    const input = [
      'INSTRUMENT\tISIN\tINSTRUMENT TYPE\nApple Inc.\tUS0378331005\tStock',
    ];
    const { pages, replacements } = anonymizePages(input);
    expect(pages[0]).toBe(input[0]);
    expect(replacements.customerLines).toBe(0);
    expect(replacements.accountIds).toBe(0);
  });

  it('returns a new pages array (does not mutate input)', () => {
    const input = ['Account ID: 5555'];
    const inputCopy = [...input];
    anonymizePages(input);
    expect(input).toEqual(inputCopy);
  });

  it('counts customer replacements correctly when the header appears in multiple pages', () => {
    const input = [
      'CUSTOMER ID\tCUSTOMER NAME\n6456112\tDragos-Cosmin Ifrim\nPage 1 content',
      'CUSTOMER ID\tCUSTOMER NAME\n6456112\tDragos-Cosmin Ifrim\nPage 2 content',
    ];
    const { pages, replacements } = anonymizePages(input);
    expect(replacements.customerLines).toBe(2);
    for (const p of pages) {
      expect(p).toContain('99999999\tAnonymized User');
      expect(p).not.toContain('Dragos-Cosmin Ifrim');
    }
  });
});
