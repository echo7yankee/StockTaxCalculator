# InvesTax Launch Plan — Documentation Index

This directory contains the InvesTax launch plan, split into focused files for easier navigation. The original single-file version was too large for the code agent to read in one tool call.

**For the code agent:** Read this index first, then read files in the order shown below. You don't need to read all files at once — read what's relevant to your current task.

---

## File overview

| File | ~Tokens | Purpose | When to read |
|---|---|---|---|
| `00-INDEX.md` (this file) | ~1.1k | Navigation guide | First, always |
| `01-priority-and-execution.md` | ~3.2k | **Priority order, execution sequence, easy-to-forget details, agent context** | First work session — defines what to do and in what order |
| `02-business-legal-prerequisites.md` | ~3.3k | PFA registration, banking, Lemon Squeezy setup, PFA vs SRL analysis | Reference only — Dragos handles these tasks |
| `03a-payment-setup.md` | ~2.1k | Pricing, paywall, /pricing page, database schema, Lemon Squeezy integration approach | When implementing payment integration |
| `03b-payment-testing.md` | ~3.9k | Test mode + real-money verification (4 phases) | When testing the payment flow |
| `03c-payment-email-refunds.md` | ~1.9k | Pricing FAQ, email infrastructure (Resend + Cloudflare), refund flow | When setting up email and finalizing payment |
| `04-trust-safety-mobile.md` | ~4.4k | **REBRAND (3.0), landing page, disclaimer, privacy/terms, GDPR, contact page, MOBILE AUDIT (3.6), TAX YEAR SCOPING (3.7)** | Priority 0 (rebrand), Priority 1 (mobile), Priority 1.5 (tax year scoping) — start here |
| `05-analytics-monitoring.md` | ~0.4k | Plausible, Sentry, UptimeRobot, backups | After core features are working |
| `06-testing.md` | ~0.8k | 8 named test scenarios, cross-browser, load test | Before declaring any section complete |
| `07-launch-strategy.md` | ~1.2k | Soft launch plan, public launch channels, sample posts | Reference for marketing — not code agent's primary concern |
| `08-roadmap-and-expectations.md` | ~3.2k | Realistic year 1 numbers, multi-year roadmap, multi-country expansion plan | Reference only — gives strategic context |
| `09-backlog-and-discipline.md` | ~1.4k | Parked ideas log, discipline guardrail (anti-scope-expansion rules) | Read if tempted to add features not in the plan |
| `10-definition-of-ready.md` | ~4.2k | Pre-launch checklist + Section 9.1 (auth audit) + Section 9.2 (form validation audit), FAQs the agent will have, critical reminders | Before declaring "ready to launch", and when working on auth/forms |
| `11-appendix-manual-onrc.md` | ~0.5k | Backup manual PFA registration steps | Reference only — Dragos uses SOLO instead |

**Total: ~28k tokens across 14 files. No single file exceeds ~5k tokens.**

---

## Reading order for the code agent

**First session (orientation):**
1. `00-INDEX.md` (this file)
2. `01-priority-and-execution.md` — understand what to work on, in what order
3. `09-backlog-and-discipline.md` — understand the discipline rules BEFORE doing anything
4. `10-definition-of-ready.md` — understand the success criteria

**Then, when starting work, read the file relevant to your current task:**

| Working on... | Read this file |
|---|---|
| Section 3.0 (rebrand) | `04-trust-safety-mobile.md` |
| Section 3.6 (mobile audit) | `04-trust-safety-mobile.md` |
| Section 3.7 (tax year scoping for rate mentions) | `04-trust-safety-mobile.md` |
| Section 2 (payment integration) | `03a-payment-setup.md` |
| Testing payments | `03b-payment-testing.md` |
| Email infrastructure | `03c-payment-email-refunds.md` |
| Section 3 (trust & safety) | `04-trust-safety-mobile.md` |
| Section 4 (analytics) | `05-analytics-monitoring.md` |
| Test scenarios | `06-testing.md` |
| Pre-launch checklist | `10-definition-of-ready.md` |

**Do NOT read all files in one session.** That wastes context window space. Read what you need, do the work, then read the next file when needed.

---

## Other documents in this project

| Document | Purpose | Status |
|---|---|---|
| `taxe-romania-spec.md` | Original build spec — tax rules, algorithms, CSV format, database schema | Reference only, do NOT modify |
| `investax-context-handoff.md` | Quick context for fresh Claude sessions (Dragos's preferences, locked-in decisions) | Read if you're a fresh Claude session |

---

## Decision rules

When in doubt:
- **Scope, deadlines, priorities** → launch plan files (this directory) win
- **Tax rules, algorithms, technical correctness** → `taxe-romania-spec.md` wins
- **Communication style with Dragos** → `investax-context-handoff.md`

---

## Critical reminders (carry these in your head at all times)

1. **The PDF flow is the recommended path.** CSV is "advanced/experimental" with stock split warning.
2. **One viral negative post can kill the product.** Test obsessively before launching.
3. **The May 25, 2026 deadline is non-negotiable.** Every day after April 14 is lost revenue.
4. **Trust > features.** Numbers must be correct.
5. **Don't break what works.** Tax engine, BNR fetcher, PDF parser are all working — do not refactor.
6. **Don't add features not in the plan.** Park them in `09-backlog-and-discipline.md` Section 8.2 instead.
7. **If stuck, ASK Dragos.** Don't guess, don't improvise.

---

## 🤖 AUTOPILOT PROTOCOL (for the code agent)

**Dragos doesn't manage tasks. You decide what to work on. Follow this protocol every session.**

**This protocol enforces a proper git workflow: branch → work → test → commit → PR → review → merge → pull → update docs → end session. Never skip steps. Never commit directly to main.**

### Phase 1 — Orient yourself (start of every session)

1. **Read these files first:**
   - `00-INDEX.md` (this file)
   - `01-priority-and-execution.md`
   - `10-definition-of-ready.md` (the canonical checklist)
   - `09-backlog-and-discipline.md` (the rules you must apply to yourself)

2. **Sync with remote and check state:**
   ```
   git checkout main
   git pull origin main
   git status
   git log --oneline -30
   ```
   Read the last 5-10 commit messages. Read the Session Log at the bottom of this file. Understand what state the project is in.

3. **Verify clean working state:**
   - `git status` should show "nothing to commit, working tree clean"
   - If not, STOP and ask Dragos what to do with uncommitted changes

### Phase 2 — Decide what to work on

4. **Cross-reference against the Definition of Ready:**
   - Open `10-definition-of-ready.md`
   - Identify the highest-priority unchecked item that:
     - Has no blocking dependencies still incomplete
     - You can actually work on (e.g., don't try to test live payments if Dragos hasn't set up Lemon Squeezy yet)
     - Is in your scope (code work, not Dragos's bureaucracy track)

5. **Read the relevant detailed file:**
   - The index above tells you which file to read for which task
   - Read ONLY that file, not all of them

6. **Present your plan to Dragos:**
   - Tell Dragos in 2-3 sentences what you've decided to work on and why
   - State the branch name you'll create
   - Outline the implementation steps
   - Wait for "go"

### Phase 3 — Branch and execute

7. **Create a feature branch with a descriptive name:**
   ```
   git checkout -b feat/section-3-0-rebrand-to-investax
   git checkout -b fix/section-3-6-mobile-auth-button
   git checkout -b feat/section-2-lemon-squeezy-integration
   ```
   Branch naming convention:
   - `feat/section-X-Y-short-description` for new features
   - `fix/section-X-Y-short-description` for bug fixes
   - `chore/section-X-Y-short-description` for non-functional updates (refactoring docs, tooling, etc.)
   - Always reference the launch plan section number

8. **Execute the task end-to-end:**
   - Do not ask for permission mid-task unless you hit a true blocker
   - Apply the discipline rules from `09-backlog-and-discipline.md` to your own work
   - Don't refactor working code, don't add features not in the plan, don't improvise
   - Commit incrementally with descriptive messages as you complete logical sub-units

### Phase 4 — Test before declaring done

9. **Run the full test suite:**
   ```
   npm test  (or whatever the project uses)
   ```
   ALL tests must pass. If any test fails, fix it before proceeding.

10. **Manual smoke test:**
    - Build the project: `npm run build`
    - Verify no build errors or warnings
    - For UI changes: open in browser, click through the affected flows
    - For mobile work: use Chrome DevTools Device Mode (iPhone SE, Pixel 5 minimum)
    - For payment work: verify in Lemon Squeezy test mode dashboard
    - Document what you tested in the PR description

11. **Lint and type-check:**
    ```
    npm run lint
    npm run typecheck  (or tsc --noEmit)
    ```
    Zero errors, zero new warnings.

### Phase 5 — Commit, PR, review

12. **Commit cleanly:**
    - Squash any incremental commits if they're noise (e.g., "fix typo", "wip")
    - Final commit message format:
      ```
      [Section X.Y] Short description of what changed
      
      - Bullet point of specific change 1
      - Bullet point of specific change 2
      - Bullet point of specific change 3
      
      Tests: all passing (X tests run)
      Manual verification: [what you tested]
      Definition of Ready item completed: [exact checkbox text from 10-definition-of-ready.md]
      ```

13. **Push the branch:**
    ```
    git push origin feat/section-X-Y-description
    ```

14. **Create a Pull Request:**
    - Use the GitHub CLI if available: `gh pr create --title "..." --body "..."`
    - Or instruct Dragos to create the PR via GitHub's web UI
    - PR title format: `[Section X.Y] Short description`
    - PR body must include:
      - **What changed:** bullet list of changes
      - **Why:** reference to the launch plan section and Definition of Ready item
      - **Testing:** what was tested, how, and the results
      - **Screenshots:** for any UI changes (mobile + desktop)
      - **Breaking changes:** none (if there are any, STOP and ask Dragos)
      - **Rollback plan:** how to revert if something breaks in production

15. **Self-review the PR:**
    - Read the PR diff yourself before asking Dragos to review it
    - Look for: leftover console.log statements, commented-out code, hardcoded test values, missing error handling, accessibility issues, missing translations
    - If you find issues, fix them and push another commit before asking Dragos to review
    - Tell Dragos: "PR ready for review at [URL]. I've self-reviewed and found nothing concerning. The diff is X lines across Y files."

### Phase 6 — Merge and sync

16. **After Dragos approves the PR:**
    - Merge via the GitHub UI (squash merge preferred for clean main history)
    - Or use: `gh pr merge --squash --delete-branch`
    - Verify the deploy succeeded (Hetzner / production environment)

17. **Pull main and verify:**
    ```
    git checkout main
    git pull origin main
    git log --oneline -5
    ```
    Confirm your merged commit is now on main.

18. **Verify production:**
    - If the deploy is automatic, wait for it to complete
    - Visit https://investax.app and smoke test the affected area
    - Check Sentry for any new errors
    - If anything is broken in production, immediately revert (`git revert HEAD` and push)

### Phase 7 — Update docs and end session

19. **Update the Definition of Ready checklist:**
    - Open `10-definition-of-ready.md`
    - Check off the item(s) you completed
    - If new items emerged during the work (bugs found, follow-up tasks), add them as new unchecked items

20. **Update the Session Log at the bottom of this file (`00-INDEX.md`):**
    - Append one line in the format:
      ```
      YYYY-MM-DD | session #N | Claude Code | Completed: [what] | Next: [what next session should do]
      ```
    - Be specific. The next session reads this line first to know where to pick up.

21. **Commit the doc updates:**
    - Create a small follow-up commit on main (or a tiny PR if you prefer)
    - Message: `[docs] Update session log and DoR checklist for [task]`
    - Push it

22. **Final report to Dragos:**
    - Summarize what was done, what's deployed, what was tested
    - State explicitly what the next session will pick up
    - If any blockers were discovered, list them clearly
    - End the session

### When to STOP and ask Dragos (don't proceed alone):

- Tests fail and you can't figure out why within 3 attempts
- The task requires a decision not documented in any .md file (e.g., "should we use library X or Y?")
- You discover the task requires changes outside the scope of the current branch
- A migration is needed that could destroy data
- You need credentials, API keys, or external service access
- The Definition of Ready item is ambiguous and you're not sure what "done" means
- Any change would affect the live payment flow or real user data

### Three permanent rules (apply to every session):

1. **Don't refactor working code.** If something works and isn't on the launch plan, leave it alone.
2. **Don't add features not in the plan.** Park ideas in `09-backlog-and-discipline.md` Section 8.2.
3. **Never commit directly to main.** Always work in a branch and use a PR. No exceptions.

---

## 📝 SESSION LOG (append to this section at end of each session)

Format: `YYYY-MM-DD | session # | agent | what was completed | what's next`

**The most recent entry tells the next session where to start.**

---

**Initial state — April 7, 2026:** Launch plan documentation set created. MVP deployed at https://investax.app. Mobile responsiveness bugs reported by Dragos. Rebrand from StockTax → InvesTax not yet started. Payment flow not yet implemented. Track A items (PFA, Lemon Squeezy account, Revolut Business) in progress by Dragos in parallel.

**Next session should:** Start with Section 3.0 (rebrand StockTax → InvesTax) per priority order. After rebrand, proceed to Section 3.6 (mobile responsiveness audit). Both must be done before any payment integration work.

---

**2026-04-09 | planning session | Claude (chat, not code agent) | Discussed impact of Legea 239/2025 on InvesTax.** Key facts confirmed: (1) Tax year 2025 rate for non-resident brokers is still 10% — current engine is correct, current filings (including Dragos's own 28,053 lei) are valid. (2) Tax year 2026 rate rises to 16% per Legea 239/2025, effective Jan 1 2026, filed in 2027. (3) Resident brokers (XTB RO, Tradeville, etc.) withhold at source at 3%/6% — not InvesTax's target audience. (4) Dragos confirmed via grep that the 10% rate is hardcoded in multiple files. **Decision split into two tasks to preserve launch sprint discipline:** Task A (pre-launch, blocking) = copy audit to scope all rate mentions to tax year 2025, added as new **Section 3.7 in `04-trust-safety-mobile.md`**. Task B (post-launch, deadline Oct 31 2026) = engine year-awareness refactor, added as **item #13 in `09-backlog-and-discipline.md` Section 8.1**. **Critical:** engine refactor must NOT start before June 15, 2026 per discipline guardrail and roadmap Phase 2. Copy audit must happen AFTER Section 3.0 rebrand but BEFORE public launch.

**Next session should:** Follow existing priority order — Section 3.0 (rebrand) first, then Section 3.6 (mobile), THEN Section 3.7 (the new tax year scoping copy audit) before proceeding to payment integration. Section 3.7 is copy-only, 1-2 hours, must be done before public launch April 14-17. Do NOT touch the engine or `taxe-romania-spec.md` as part of Section 3.7 — that work is parked in backlog item #13 with an October 31, 2026 deadline and a June 15, 2026 earliest start date.

---

**2026-04-09 | session #1 | Claude Code (Opus) | Completed: Section 3.7 — Tax year scoping for rate mentions (Legea 239/2025 prep). PR #30 created. All user-facing "10%" references scoped to "tax year 2025". Added Legea 239/2025 forward-looking disclaimer to footer, new FAQ entry about 2026 rate change, prominent banner on filing guide, scoped meta/OG descriptions. 22 files changed, copy only — zero engine changes. Build passes, shared+server tests pass, client test failures pre-existing. DoR checklist updated with Section 3.7 item (unchecked pending merge). | Next: Merge PR #30 after Dragos approves. Then next priority is Priority 2 — Payment flow (Section 2), but this is blocked on Dragos providing Lemon Squeezy credentials. If LS is still blocked, next code work could be remaining auth audit items from Section 9.1 that don't require external services, or Priority 3 trust & safety items not yet completed. Also note: client unit tests (CalculatorPage, Dashboard, ResultsPage) have pre-existing failures due to happy-dom/HelmetProvider test setup issue — should be fixed in a separate chore PR.**

---

**2026-04-09 | session #2 | Claude Code (Opus) | Completed: Fixed all 24 pre-existing client unit test failures. PR #31 created and auto-merged (Mode B: test-only change, no protected files, 64-line diff, all 147 tests passing). Root causes: (1) HelmetProvider missing from test render wrappers — added to CalculatorPage, Dashboard, ResultsPage tests. (2) Dashboard tests mocked user with plan='free' but PR #24 added paywall gate blocking fetch for free users — changed to plan='paid'. (3) CalculatorPage 'zero input' test expected results but PR #27 added validation blocking zero-only submissions — updated to test validation error. Also checked off Section 3.7 DoR item (PR #30 was merged before this session). | Deployed: yes (test-only, production unaffected, site responding 200). | Next: Priority 2 (Payment flow) still blocked on Dragos providing Lemon Squeezy credentials. Remaining code work: (a) Section 9.1 auth audit code items not requiring external services (session management, error handling), (b) pre-existing lint errors could be cleaned up as a chore. Critical path is now Dragos's parallel items: LS credentials, Resend account, Google OAuth production config, personal device testing. Almost all remaining DoR items are blocked on Dragos or external services. | Notes: 21 pre-existing lint errors across the codebase (unused vars, no-explicit-any, setState-in-effect) — none introduced by recent PRs, could be a low-priority cleanup chore.**

**End of index. Begin Step 1 of the Autopilot Protocol above.**
