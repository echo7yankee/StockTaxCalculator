# Customer PDF Intake Runbook

End-to-end procedure for handling a customer who reports that InvesTax parsed
their Trading 212 statement incorrectly. Codifies what was done ad-hoc for
Florin Pop (session #64, 2026-05-24) and Paul Adam (session #41, 2026-05-19),
the first two paying customers, both of whom hit format-specific parser bugs.

The goal: every reported parse bug becomes a committed regression fixture, a
parser or engine fix, a customer notification, and a taxonomy entry. No bug
gets "fixed in passing" without a fixture, because the fixture is what
prevents the regression.

## When this runbook triggers

Run this procedure when ANY of the following holds:

- A customer emails support reporting a wrong number on the results page or in
  the D212 mapping.
- The PR #119 hard-stop banner fired for a paying user (warning visible, D212
  export hidden) and the customer wants the file unblocked.
- The PR #120 engine sign-mismatch or magnitude-mismatch warning fired on a
  customer upload.
- Operations sees a `parse-failure` or `parse-warning` row in the
  `ParseAlertLog` table that does not match any known format from
  `docs/t212-pdf-formats.md`.
- A scheduled `investax-parse-health-monitor` email (PR #123) flags an
  anomaly cluster.

Do NOT run this procedure for non-parser bugs (calculation logic, CASS
brackets, BNR rate fetching, UI glitches). Those follow normal bug-fix flow.

Scope note: this runbook covers Trading 212 PDF statements reported by paying
customers. For SOLICITED beta-broker samples (IBKR Activity Statement CSV,
Revolut Account Statement xlsx, e.g. arriving via the ghid waitlists), use
`docs/broker-sample-intake-runbook.md` instead; it has its own anonymization
tool (`test-data/anonymize-broker-export.ts`) and the beta-to-trusted sample
tracker.

## Hard rules

1. **No real customer PDFs in the repo, ever.** Not in `test-data/`, not in
   `docs/`, not in commits. The anonymization step is mandatory before any
   fixture lands. See `feedback_test_fixture_data.md`.
2. **Written consent before downloading the PDF.** The customer must say in
   text ("yes, attach the PDF" or equivalent) that they consent to share it
   for debugging. Verbal or implied consent is not enough; we need a paper
   trail.
3. **Verify the bug is real before promising a fix.** Per
   `feedback_verify_real_bugs.md`: reproduce locally, check git history for
   prior fixes, run the existing test suite against the new fixture. A
   customer claim is a lead, not a confirmed bug.
4. **Do not call the customer's claim a fabrication without asking.** Per
   `feedback_ask_before_flagging.md`: if their numbers look implausible, ask
   them to walk through the math first. A polite question costs nothing; a
   wrong accusation costs the customer.
5. **Refunds are reversible, trust is not.** When in doubt about whether to
   refund, refund. Stripe direct refund via the dashboard takes 30 seconds;
   re-earning a refunded customer is impossible.
6. **Fix PR must come with the fixture in the same merged sequence.** Either
   fixture-first then fix (preferred, so the test goes red then green) or
   fixture-and-fix together. Never fix without committing the fixture.

## Step 0: Triage

Before asking for the PDF, gather what the customer already gave you and try
to classify the issue without consuming their goodwill.

1. **Read their email or contact-form submission in full.** If they pasted
   numbers, write them down. If they screenshotted the results page, save the
   screenshot (treat as PII; do not commit).
2. **Check `ParseAlertLog` for their upload.** Query by email or by approximate
   timestamp from the contact-form metadata (PR #119 pre-fills the contact
   form with the file name and the parser warning text via `location.state`,
   so they may already have sent you the file name and the warning string).

   ```bash
   ssh investax@178.104.152.247
   sqlite3 ~/app/server/prisma/dev.db "SELECT id, parsedAt, outcome, fileType, fileName, parserWarnings, engineWarnings, errorMessage FROM ParseAlertLog WHERE parsedAt > datetime('now', '-7 days') ORDER BY parsedAt DESC LIMIT 50;"
   ```

   If their row shows `outcome='success-with-warnings'` and the warnings
   string names a known shape from `docs/t212-pdf-formats.md`, the bug is
   likely already-known and you can skip ahead to the fix step against the
   existing fixture.
3. **Classify the report:**
   - **Class A: known format, known bug.** Existing fixture, no fix shipped
     yet. Skip to Step 5 (regression test exists) and Step 6 (write the fix).
   - **Class B: known format, new bug.** Fixture exists but does not
     reproduce. Skip to Step 5 (extend the existing test) and Step 6.
   - **Class C: new format we have never seen.** Run the full procedure
     starting at Step 1.
   - **Class D: not a parser bug.** User error (uploaded wrong file, looked at
     the wrong number, misread the D212 mapping), Stripe issue, account
     issue. Reply to the customer to clarify; do not consume the rest of this
     runbook.

## Step 1: Request the PDF with written consent

Send a Romanian-language reply if the customer wrote in Romanian, English if
they wrote in English. Customer-email length per `feedback_customer_email_length.md`:
under ~100 words, answer first, no padding.

**Template (RO):**

```
Salut <Name>,

Imi pare rau de problema. Pentru a o repara, am nevoie de extrasul tau
Trading 212 original (PDF-ul anual). Il folosesc strict pentru debugging,
ii sterg datele personale (nume, ID client, ID cont) inainte de a-l adauga
in suita de teste, si sterg fisierul original imediat dupa.

Daca esti de acord, atasaza-l la acest email. Daca preferi sa nu, spune-mi
exact ce numere vezi pe pagina de rezultate si ce numere asteptai, si
incercam fara.

Multumesc,
Dragos
```

**Template (EN):**

```
Hi <Name>,

Sorry for the trouble. To fix this I need your original Trading 212
PDF (annual statement). I use it strictly for debugging, strip personal
data (name, customer ID, account IDs) before adding it to the test suite,
and delete the original file right after.

If that is OK, attach it to this email. If you would rather not, tell me
the exact numbers you see on the results page and what you expected, and I
will try without.

Thanks,
Dragos
```

**Do NOT:**

- Ask for a screenshot of their broker account or login credentials.
- Promise a specific fix timeline before you have reproduced the bug.
- Offer a refund pre-emptively; offer it after the bug is confirmed (Step 0
  class A or B) or after the fix ships (Step 7).

## Step 2: Extract the PDF to a JSON page array

The customer's attached PDF lives in your local inbox or downloads folder.
Move it to a per-incident scratch directory under `tmp/intake/<incident-id>/`
where `<incident-id>` is a short slug (e.g. `florin-2026-05-24`). Anything
under `tmp/` is gitignored.

```bash
mkdir -p tmp/intake/<incident-id>
mv ~/Downloads/<theirfile>.pdf tmp/intake/<incident-id>/raw.pdf
```

Extract pages to JSON using `test-data/extract-fixture.ts`. The script's
`main()` is currently hard-coded to Dragos's fixture path; for intake runs
pass the input + output paths explicitly:

```bash
npx tsx test-data/extract-fixture.ts tmp/intake/<incident-id>/raw.pdf tmp/intake/<incident-id>/pages.json
```

If the script complains about argv handling, copy `extract-fixture.ts` to a
scratch variant under `tmp/intake/<incident-id>/extract.ts` and edit the
`pdfPath` + `outputPath` constants. Do not edit the committed extractor for a
one-off intake.

The output is a JSON array of strings, one per PDF page. Inspect it briefly:

```bash
node -e "const p=require('./tmp/intake/<incident-id>/pages.json'); console.log('pages:', p.length); console.log('page 1 first 5 lines:'); console.log(p[0].split('\n').slice(0,5).join('\n'));"
```

You should see customer name, account IDs, the T212 entity footer, and at
least one of the standard section headings (`Overview`, `Annual Statement`,
`Declaratie anuala`).

## Step 3: Anonymize

Run the committed anonymizer against the page-text JSON:

```bash
npx tsx test-data/anonymize-pdf-pages.ts tmp/intake/<incident-id>/pages.json tmp/intake/<incident-id>/anonymized.json
```

The script logs how many customer-header rows and account ID occurrences were
replaced. Verify the counts are non-zero (if they are zero, either the PDF
lacks the expected headers, in which case the parser will probably warn, OR
the anonymization rules in `test-data/anonymize-pdf-pages.ts` need extending
for this PDF's header format).

**Manual re-inspection (mandatory, not optional):**

```bash
grep -i "<customer first name>\|<customer last name>\|<known account id digits>" tmp/intake/<incident-id>/anonymized.json
```

The expected output is empty. If anything matches, the rules in
`test-data/anonymize-pdf-pages.ts` missed a case; extend the rules (in a
separate PR) before proceeding. Common gaps:

- A name baked into a payment-reference line that does not sit next to a
  customer-header row.
- An IBAN, address, or phone number in a deposits or withdrawals section.
- T212 internal IDs (deal IDs, order IDs) that may or may not be customer-
  correlatable; on the safe side, anonymize or strip.

Once the grep is clean, the anonymized JSON is safe to commit.

## Step 4: Commit the fixture

Name the fixture after the format shape, not after the customer:

```
test-data/fixtures/annual-statement-<year>-<shape-slug>.json
```

Existing slugs (do not collide):

- `pages` (canonical 2025, Dragos)
- `ro-single-account`
- `multi-account` (post-Cyprus horizontal, Florin shape)
- `ligature-broken`

If the customer's PDF is a new shape, pick a short descriptive slug
(`multi-page-sells`, `crypto-only`, `no-dividends`). If it is a variant of an
existing shape, suffix it (`multi-account-pension`, `ro-single-account-2024`).

Move from the scratch directory to the committed location:

```bash
cp tmp/intake/<incident-id>/anonymized.json test-data/fixtures/annual-statement-<year>-<slug>.json
git add test-data/fixtures/annual-statement-<year>-<slug>.json
```

Update `docs/t212-pdf-formats.md` in the same PR:

- If this is a NEW shape (Class C), add a new `### Shape N: <name>` entry
  under "Committed shapes" mirroring the existing Shape 1-4 prose.
- If this extends an existing shape, add the new fixture path to the existing
  Shape entry and call out what differs (year, account type, language).
- Update the relevant "Per-dimension reference" rows under SEEN to include
  the new fixture.

## Step 5: Add a regression test

Open `shared/src/engine/__tests__/pdfIntegration.test.ts` and add a new
`describe(...)` block at the bottom, mirroring the existing Shape 2 / 3 / 4
blocks:

```ts
// Shape N: <name>. See docs/t212-pdf-formats.md.
describe('PDF Integration: <shape name>', () => {
  const parsed = parseTrading212AnnualStatement(loadFixture('annual-statement-<year>-<slug>.json'));
  const { taxResult, warnings: engineWarnings } = calculateTaxesFromPdf(parsed, romaniaTaxConfig, <bnrRate>);

  describe('parsing', () => {
    it('detects year <year>', () => { expect(parsed.year).toBe(<year>); });
    it('detects <currency> as overview currency', () => { expect(parsed.overview.currency).toBe('<currency>'); });
    it('parses <N> sell trades', () => { expect(parsed.sellTrades).toHaveLength(<N>); });
    // ... more invariants as needed
  });

  describe('tax calculation', () => {
    it('totalTaxOwed matches expected for this fixture', () => {
      expect(taxResult.totals.totalTaxOwed).toBeCloseTo(<expected>, 2);
    });
  });
});
```

The `<expected>` value: compute it by hand (or with a side calculator) from
the parsed sell trades and dividends, NOT by running the engine and copying
the output. If you copy the engine output, the test only re-asserts whatever
the engine currently does, which is the opposite of regression coverage.

**Run the test:**

```bash
npx vitest run shared/src/engine/__tests__/pdfIntegration.test.ts
```

For a Class C (new shape) intake, the test will probably go RED on first run,
because the parser does not yet handle the new shape. That is the correct
state; the red test is what the fix PR turns green.

For a Class A or B intake (known shape, new bug), the test should reproduce
the specific bug the customer reported (wrong number, missing warning, etc.).
If it does not reproduce, return to Step 0; you may have misclassified.

**The 28,053 lei regression is sacred.** Re-run the full integration suite
and confirm `pdfIntegration` stays 24/24 green on Shape 1 throughout:

```bash
npx vitest run shared/src/engine/__tests__/pdfIntegration.test.ts -t "Annual Statement 2025"
```

## Step 6: Fix the bug

The fix is a SEPARATE PR from the fixture, unless the fixture-and-fix can
land together cleanly (line-count, single coherent diff). When in doubt,
fixture-first; the green test on the second PR is the proof.

Engine and parser are coverage-gated, not do-not-touch. Per Section 8.5 of
`investax-docs/09-backlog-and-discipline.md`:

- The fix must include or extend a test that exercises the changed path.
- The 28,053 lei regression must stay green.
- Diff stays minimal and surgical; no while-I-am-here refactors.

If the bug is in `shared/src/parsers/trading212Pdf.ts`, run both:

```bash
npx vitest run shared/src/parsers/__tests__/trading212Pdf.test.ts
npx vitest run shared/src/parsers/__tests__/trading212Pdf.synthesized.test.ts
```

The synthesized sweep (PR #126) catches regressions that affect any of the
224 spec combinations; if your fix breaks a different shape, the sweep will
tell you.

If the bug is in `shared/src/engine/pdfTaxCalculator.ts`, also run:

```bash
npx vitest run shared/src/engine/__tests__/pdfTaxCalculator.synthesized.test.ts
```

## Step 7: Notify the customer

Send the customer a reply once the fix is merged and deployed (not before).
Under ~100 words. Answer first.

**If a refund is the right call (Florin case):**

```
Salut <Name>,

Am gasit problema si am reparat-o (a fost o problema de parsare a
formatului tau de extras). Iti returnez integral cei 12 euro. Apar
inapoi in cont in 5-10 zile lucratoare.

Daca vrei sa reincerci aplicatia dupa fix, contul tau redevine activ
automat la refund si poti urca extrasul din nou fara sa platesti din nou.
Daca preferi sa nu, e in regula, nu ramai cu nicio obligatie.

Multumesc ca ai semnalat.
Dragos
```

Issue the refund via the Stripe dashboard. The webhook
(`server/src/routes/webhook.stripe.ts`) auto-downgrades the user's plan on
`charge.refunded`. Note the refund ID
(e.g. `re_3Tak2UR8uqi28rgR1k0VPGUY`) in the session log entry.

**If the fix landed before they were blocked (Paul case):**

```
Salut <Name>,

Am gasit problema si am reparat-o. Daca incerci sa urci din nou extrasul
acum, numerele vor fi corecte.

Multumesc ca ai semnalat. Daca ceva nu se vede bine, raspunde-mi direct.

Dragos
```

**Do NOT:**

- Admit liability beyond "a fost o problema de parsare". Avoid "calculul a
  fost gresit"; the engine math is independent of the parser bug.
- Promise that no other format will have this bug. Per
  `feedback_writing_style.md`, no AI-tell phrasing ("we now fully support all
  T212 formats", "this should never happen again").
- Send the customer the technical details of the fix. They are not
  interested; they want their number to be right.

## Step 8: Clean up scratch state

The customer's original PDF and the pre-anonymization page-text JSON live
under `tmp/intake/<incident-id>/`. Delete the entire directory after the fix
is merged and deployed:

```bash
rm -rf tmp/intake/<incident-id>
```

Retention: zero days. The committed anonymized fixture is the only artifact
that persists. If you need the raw PDF again, ask the customer again (with
written consent again). Do not stash it "just in case".

Empty your local trash too if the OS does soft-deletes.

## Step 9: Update the format taxonomy and parse health context

Final pass on `docs/t212-pdf-formats.md`:

- Move the new shape from "Theorized" to "Seen" under the relevant
  per-dimension rows if it covers a previously-uncovered dimension.
- If the customer's PDF revealed a parser dimension we did not know existed
  (a new T212 entity, a new language, a new currency representation), add a
  new dimension row under "Per-dimension reference".
- If the synthesizer at `test-data/synthesize-t212-pages.ts` could now
  generate this shape (a parameter combination that did not previously exist),
  consider extending the synthesizer and the sweep specs at
  `test-data/synthesized-sweep-specs.ts` to cover it. That is a separate PR.

Update the session log entry (`investax-docs/00b-SESSION-LOG.md`) with the
intake details: customer name (if Dragos consents to logging it), refund ID
if applicable, fixture slug, fix PR number, prevention notes (sweep extended,
new dimension covered).

## Why this exists

Two paying customers, two parser bugs in the first six days
(Paul 2026-05-19, Florin 2026-05-24). Both were fixed within a session;
neither customer asked for a second refund. The risk window: the next
customer hits a third format and the response is slower because the
procedure was not written down. This runbook is the answer to that risk.

The prevention foundation already exists in code:

- PR #119 hard-stop banner blocks the D212 export when parser warnings fire.
- PR #120 engine warnings catch sign-flips and magnitude jumps.
- PR #121 anonymization tool + format taxonomy doc.
- PR #122 property-based tests + PR #126 cartesian sweep.
- PR #123 ParseAlertLog DB + Sentry tagging + scheduled monitor.

This document closes the loop on the human side: when prevention fails and a
real customer reports a bug, the bug becomes a permanent regression fixture
instead of an ad-hoc fix that may regress on the next format change.
