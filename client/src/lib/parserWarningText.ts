import i18n from '../i18n/i18n';
import type { ParserWarning } from '@shared/index';

/**
 * Localize parser warnings at the render boundary (SUGGESTIONS S6 phase B).
 *
 * Parsers emit canonical ENGLISH prose (`warnings: string[]`) plus structured
 * warnings carrying a stable `code` and the raw `params` the prose interpolates.
 * The prose channel stays canonical everywhere machines or the operator read it
 * (gate telemetry, /api/parse-reports -> ParseAlertLog, the contact-form
 * prefill) so prod reports remain greppable; ONLY what the user sees on screen
 * is translated, here.
 *
 * Design: iterate the PROSE channel and substitute per entry, so what renders
 * keeps exactly today's count and order. A prose entry is localized only when
 * an exact-message structured twin exists (the sink writes both channels with
 * identical strings, so a twin proves which code produced this prose) AND the
 * active locale has a template for that code. Everything else renders verbatim:
 *  - engine warnings (#24C sign/magnitude checks carry no ParserWarningCode),
 *  - pre-phase-A persisted previews (no structured channel at all),
 *  - a future code without a template yet (falls back to English rather than
 *    showing a raw i18n key).
 * Params interpolate via i18next with escapeValue:false; React escapes at
 * render, so file-derived values stay literal text (the #265 XSS posture).
 */
export function localizeParserWarnings(
  prose: readonly string[],
  structured?: readonly ParserWarning[]
): string[] {
  if (!structured || structured.length === 0) return [...prose];

  const byMessage = new Map<string, ParserWarning>();
  for (const w of structured) {
    if (!byMessage.has(w.message)) byMessage.set(w.message, w);
  }

  return prose.map((message) => {
    const twin = byMessage.get(message);
    if (!twin) return message;
    const key = `parserWarnings:${twin.code}`;
    if (!i18n.exists(key)) return message;
    const localized = i18n.t(key, { ...(twin.params ?? {}) });
    // A structured warning persisted before params existed (phase A stash), or a
    // template whose placeholder set drifted from the emitted params, would leave
    // raw {{holes}}; the English prose is strictly better than a broken template.
    return localized.includes('{{') ? message : localized;
  });
}
