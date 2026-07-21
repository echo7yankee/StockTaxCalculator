import { describe, it, expect, afterEach } from 'vitest';
import i18n from '../../i18n/i18n';
import { localizeParserWarnings } from '../parserWarningText';
import { WARNING_SEVERITY, createWarningSink, parseRevolutStatement } from '@shared/index';
import type { ParserWarning, ParserWarningCode } from '@shared/index';
import enWarnings from '../../i18n/locales/en/parserWarnings.json';
import roWarnings from '../../i18n/locales/ro/parserWarnings.json';

/**
 * S6 phase B: the i18n render boundary for parser warnings. The prose channel
 * stays canonical English (telemetry, ParseAlertLog, contact prefill); ONLY the
 * on-screen list is localized, and only when an exact-message structured twin
 * identifies the code. Everything unmatched renders verbatim.
 */

afterEach(async () => {
  await i18n.changeLanguage('ro');
});

function warning(code: ParserWarningCode, message: string, params?: Record<string, string | number>): ParserWarning {
  return { code, severity: WARNING_SEVERITY[code], message, ...(params ? { params } : {}) };
}

describe('locale key parity', () => {
  const codes = Object.keys(WARNING_SEVERITY) as ParserWarningCode[];

  it('every ParserWarningCode has an EN and a RO template', () => {
    for (const code of codes) {
      expect(enWarnings, `missing EN key ${code}`).toHaveProperty(code);
      expect(roWarnings, `missing RO key ${code}`).toHaveProperty(code);
    }
  });

  it('EN and RO templates interpolate the same placeholder sets', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const code of codes) {
      expect(
        placeholders((roWarnings as Record<string, string>)[code]),
        `placeholder mismatch on ${code}`
      ).toEqual(placeholders((enWarnings as Record<string, string>)[code]));
    }
  });

  it('codes sharing one byte-identical prose template share one severity (S15)', () => {
    // The EN templates mirror each push site's prose exactly (key parity above,
    // template-equals-prose pinned by the phase B render tests), so grouping
    // them finds every cross-parser shared sentence: today the IBKR/Revolut
    // unsupported-currency pair and the t212/ibkr/revolut no-transactions trio.
    // The merge dedupe keys on code + message and the gate's prose-twin check
    // matches on message alone, so two codes sharing prose but differing in
    // severity would let an info twin mask a fatal one in a cross-broker merge
    // (SUGGESTIONS S13/S15). This sweep turns that divergence into a test
    // failure for every current AND future code, which is what lets single-
    // sided severity flips stay safe.
    const byTemplate = new Map<string, ParserWarningCode[]>();
    for (const code of codes) {
      const template = (enWarnings as Record<string, string>)[code];
      byTemplate.set(template, [...(byTemplate.get(template) ?? []), code]);
    }
    const shared = [...byTemplate.entries()].filter(([, group]) => group.length > 1);
    // Premise guard: the shared templates genuinely exist, else the sweep is a no-op.
    expect(shared.length).toBeGreaterThanOrEqual(2);
    for (const [template, group] of shared) {
      const severities = new Set(group.map((c) => WARNING_SEVERITY[c]));
      expect(
        severities.size,
        `codes [${group.join(', ')}] share the template "${template}" but differ in severity`
      ).toBe(1);
    }
  });
});

describe('localizeParserWarnings', () => {
  const proseUnsupported =
    'Unsupported currencies found (CHF). InvesTax supports USD, EUR, GBP and RON; those rows were skipped.';

  it('renders the RO template with interpolated params under the RO locale', async () => {
    await i18n.changeLanguage('ro');
    const out = localizeParserWarnings(
      [proseUnsupported],
      [warning('revolut_unsupported_currencies_skipped', proseUnsupported, { currencies: 'CHF' })]
    );
    expect(out).toEqual(['Am găsit valute neacceptate (CHF). InvesTax acceptă USD, EUR, GBP și RON; acele rânduri au fost omise.']);
  });

  it('renders the EN template under the EN locale', async () => {
    await i18n.changeLanguage('en');
    const out = localizeParserWarnings(
      [proseUnsupported],
      [warning('revolut_unsupported_currencies_skipped', proseUnsupported, { currencies: 'CHF' })]
    );
    expect(out).toEqual([proseUnsupported]);
  });

  it('localizes real sink output end-to-end through the real Revolut parser', async () => {
    await i18n.changeLanguage('ro');
    const parsed = parseRevolutStatement([
      ['Date', 'Ticker', 'Type', 'Quantity', 'Price per share', 'Total Amount', 'Currency', 'FX Rate'],
      ['2025-03-06T10:00:00.000Z', 'ATVI', 'MERGER - CASH', '', '', '$950', 'USD', '1'],
    ]);
    const out = localizeParserWarnings(parsed.warnings, parsed.structuredWarnings);
    expect(out).toEqual(['Am găsit tipuri de tranzacții nerecunoscute (MERGER - CASH). Acele rânduri au fost omise; verifică-le înainte de depunere.']);
  });

  it('renders twinless prose verbatim (engine warnings carry no code)', async () => {
    await i18n.changeLanguage('ro');
    const engineWarning = 'Sign mismatch between per-row sells and the overview.';
    const out = localizeParserWarnings(
      [proseUnsupported, engineWarning],
      [warning('revolut_unsupported_currencies_skipped', proseUnsupported, { currencies: 'CHF' })]
    );
    expect(out[0]).toContain('valute neacceptate');
    expect(out[1]).toBe(engineWarning);
  });

  it('returns prose untouched when there is no structured channel (pre-phase-A stash)', () => {
    const out = localizeParserWarnings([proseUnsupported]);
    expect(out).toEqual([proseUnsupported]);
  });

  it('falls back to prose when a parameterized template has no params (phase-A stash)', async () => {
    await i18n.changeLanguage('ro');
    // Structured warning persisted by phase A: code + message but NO params. The
    // template needs {{currencies}}, so localization would leave a raw hole.
    const out = localizeParserWarnings(
      [proseUnsupported],
      [warning('revolut_unsupported_currencies_skipped', proseUnsupported)]
    );
    expect(out).toEqual([proseUnsupported]);
  });

  it('interpolated file-derived values stay literal (no i18n-side mangling)', async () => {
    await i18n.changeLanguage('ro');
    const hostile = '<img src=x onerror=alert(1)>, "quoted"';
    const sink = createWarningSink();
    sink.push(
      'revolut_unrecognised_types_skipped',
      `Unrecognised transaction types found (${hostile}). Those rows were skipped; check them before filing.`,
      { types: hostile }
    );
    const out = localizeParserWarnings(sink.warnings, sink.structuredWarnings);
    expect(out[0]).toContain(hostile);
  });
});
