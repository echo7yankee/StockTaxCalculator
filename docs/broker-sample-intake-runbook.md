# Broker Sample Intake Runbook (IBKR CSV, Revolut xlsx)

End-to-end procedure for handling a SOLICITED beta-broker export: a user sends
us their IBKR Activity Statement or Revolut Account Statement so we can
validate the beta parser against real data. This is the path that graduates a
broker from BETA to TRUSTED per the Regression Firewall
(`investax-docs/09-backlog-and-discipline.md` Section 8.6 #5: at least 3 real
anonymized exports per broker, parsing correctly end-to-end, committed as
fixtures).

This runbook is the CSV/xlsx counterpart of `docs/customer-pdf-intake-runbook.md`
(which covers a PAYING customer reporting a Trading 212 PDF parse bug). Use
that one for bug reports; use this one when a sample arrives via:

- the broker beta waitlists on `/ghid/declaratie-unica-revolut` and
  `/ghid/declaratie-unica-ibkr` (topics `broker_revolut` / `broker_ibkr`),
- a Reddit / community reply to a solicitation post,
- a direct email offering an export.

If a PAYING user reports a wrong number on an IBKR/Revolut upload, both
runbooks apply: this one for the fixture mechanics, the PDF runbook's Steps 0,
6, 7 for triage, fix and customer notification.

## Hard rules (same as the PDF runbook)

1. **No real customer files in the repo, ever.** The anonymization step is
   mandatory before any fixture lands. See `feedback_test_fixture_data.md`.
2. **Written consent before using the file.** The sender must say in text that
   they consent to the file being used for testing after personal data is
   stripped. The waitlist/solicitation reply template below asks for exactly
   that.
3. **Manual re-inspection after the tool runs.** The anonymizer covers the
   known PII shapes; a real export can carry one we have not seen. The grep
   step is not optional.
4. **Originals are deleted after the fixture is committed.** Retention zero,
   same as the PDF runbook Step 8.

## Step 1: Reply to the sender (consent + instructions)

Keep it under ~100 words, answer first, no padding
(`feedback_customer_email_length.md`).

**Template (RO):**

```
Salut,

Multumesc ca vrei sa ne ajuti cu validarea. Am nevoie de extrasul exportat
direct din aplicatie:

- Revolut: Invest > More > Documents > Stocks > Account Statement > Excel >
  All time
- IBKR: Reports > Statements > Activity > anul intreg > CSV

Inainte sa-l folosesc, ii sterg datele personale (nume, numar de cont) cu un
script si pastrez doar tranzactiile. Imi confirmi ca esti de acord sa-l
folosim asa in testele aplicatiei? Poti sterge tu numele din fisier inainte
sa-l trimiti, daca preferi.

Multumesc,
Dragos
```

**Template (EN):**

```
Hi,

Thanks for helping us validate. I need the statement exported straight from
the app:

- Revolut: Invest > More > Documents > Stocks > Account Statement > Excel >
  All time
- IBKR: Reports > Statements > Activity > full year > CSV

Before using it I strip the personal data (name, account number) with a
script and keep only the transactions. Can you confirm you are OK with it
being used like that in the app's test suite? You can also delete your name
from the file yourself before sending, if you prefer.

Thanks,
Dragos
```

## Step 2: Stash the file in a scratch directory

```bash
mkdir -p tmp/intake/<incident-id>
mv ~/Downloads/<theirfile> tmp/intake/<incident-id>/raw.<csv|xlsx>
```

`<incident-id>` is a short slug (`revolut-waitlist-2026-07-01`). Anything
under `tmp/` is gitignored.

## Step 3: Anonymize

```bash
# IBKR Activity Statement CSV:
npx tsx test-data/anonymize-broker-export.ts ibkr tmp/intake/<incident-id>/raw.csv tmp/intake/<incident-id>/anonymized.json

# Revolut Account Statement (native .xlsx, or a user-converted .csv):
npx tsx test-data/anonymize-broker-export.ts revolut tmp/intake/<incident-id>/raw.xlsx tmp/intake/<incident-id>/anonymized.json
```

The output is a JSON array of row arrays (`string[][]`): the exact shape the
parsers consume and the same rows the upload flow would produce at runtime
(papaparse `header:false` for CSV, `read-excel-file` cell coercion for xlsx).
The tool prints what it replaced:

- IBKR: `Account Information` PII values (Name, Account Alias, address-like
  fields) and every `U<digits>` account number anywhere in the file (mapped
  consistently to `U0000001`, `U0000002`, ...). Account Type / Base Currency /
  trades / instruments / dividends / withholding are never touched.
- Revolut: every non-empty cell ABOVE the table header row (the xlsx title
  block is where name and account identifiers live). The header and all data
  rows are preserved byte-identical.
- Both: emails and IBAN-shaped strings anywhere, defensively.

If the tool prints the "nothing was scrubbed" warning for an IBKR file, the
file either was pre-trimmed by the sender or carries PII in a shape the rules
do not know. Look at it manually and extend the rules in a separate PR before
committing anything.

**Manual re-inspection (mandatory, not optional):**

```bash
grep -i "<sender first name>\|<sender last name>\|<known account number>" tmp/intake/<incident-id>/anonymized.json
```

Expected output: empty. Also eyeball the first ~20 rows of the JSON: a real
export can carry PII the rules have not seen (a name inside a transfer
description, a phone number in a notes field). If anything survives, extend
`test-data/anonymize-broker-export.ts` (with a test) before proceeding.

## Step 4: Commit the fixture

Name by broker + statement type + year + shape, never by sender:

```
test-data/fixtures/ibkr-activity-statement-<year>-<slug>.json
test-data/fixtures/revolut-account-statement-<year>-<slug>.json
```

Slug describes what makes the sample interesting (`stocks-dividends`,
`multi-currency`, `options-heavy`, `ro-locale-decimals`).

## Step 5: Add the integration test

Extend the parser's own test file (`shared/src/parsers/__tests__/ibkr.test.ts`
or `revolut.test.ts`) with a `describe('real anonymized fixture: <slug>')`
block that loads the fixture JSON and asserts:

- transaction counts (buys, sells, dividends) match what you count by hand in
  the file,
- 2-3 spot values (a specific trade's shares/price/amount, a dividend amount,
  an IBKR withholding attachment),
- the exact `warnings` the parse produces (empty for a clean statement, or the
  expected beta warnings, e.g. IBKR options rows skipped).

Compute the expected values BY HAND from the fixture rows, not by running the
parser and copying its output (same rule as the PDF runbook Step 5: a
copied-output test re-asserts whatever the code currently does, which is the
opposite of regression coverage).

Then run the moat suite and confirm nothing else moved:

```bash
npx vitest run shared/src
```

The 28,053 lei regression (`shared/src/engine/__tests__/pdfIntegration.test.ts`)
must stay green; these fixtures are parser-level and cannot touch it, so any
delta means something is very wrong.

## Step 6: Count it toward BETA -> TRUSTED (or not)

A sample QUALIFIES toward the 3-export bar only if ALL hold:

1. It parses end-to-end with no warnings, or only warnings that are documented
   beta limitations the user was already told about (e.g. Revolut withholding
   not itemised). A statement that trips the hard-stop on unexplained content
   does NOT qualify (it is still valuable: it pins a gap).
2. The sender confirms the parsed counts/numbers match their own records (ask
   them: "we read N buys, M sells, X total dividends for <year>, does that
   match your app?").
3. The fixture + test are merged on main.

Update the tracker below in the same PR that commits the fixture.

When a broker reaches 3 qualifying samples: flip its UI copy from beta to
trusted (a separate PR: `client/src/lib/brokers.ts` beta flag + the ghid page
beta boxes + pricing FAQ), and RELAX, not remove, the verify-before-filing
caveat, per firewall 8.6 #5.

## Sample tracker

| Broker | Received | Qualifying | Target | Status |
|---|---|---|---|---|
| IBKR | 1 (Alexandru, 2026-06; options-dominated, hard-stops by design) | 0 | 3 | BETA |
| Revolut | 0 | 0 | 3 | BETA |
| Trading 212 PDF | n/a (own + customer fixtures committed) | n/a | n/a | TRUSTED |

Notes:

- Alexandru's IBKR statement is options-heavy (2,474.79 of 2,480.17 USD
  realized is options), so it exercises the skip path, not the happy path. It
  does not qualify, and it is also the demand signal tracked in
  `investax-docs/ibkr-options-spec.md` (build gated on 3+ asks + season). A
  stock-focused statement from him is already on Dragos's ask list.
- The ghid waitlist capture (PR #174) stores subscribers under topics
  `broker_revolut` / `broker_ibkr`; when one confirms, Step 1's template is
  the reply.

## Step 7: Clean up

```bash
rm -rf tmp/intake/<incident-id>
```

Retention zero. The committed anonymized fixture is the only artifact that
persists. Update the session log (`investax-docs/00b-SESSION-LOG.md`) with the
intake: fixture slug, qualifying yes/no, tracker state, PR number.
