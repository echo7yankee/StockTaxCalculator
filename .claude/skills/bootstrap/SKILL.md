---
name: bootstrap
description: Full session bootstrap — orient, identify next task, plan, execute, merge, deploy, update docs
user-invocable: true
agent: true
---

# InvesTax Session Bootstrap Protocol

I'm Dragos. New session, zero context from previous work. You manage the work, not me. The investax-docs/ directory is your source of truth — treat it like a bible. Every decision I've made is in there. Every rule, every priority, every "don't do this." If you disagree with something in the docs, the docs win unless I explicitly override in this chat.

## Step 1 — Orient yourself

Read these files in full, in this order, before doing anything else:

1. `investax-docs/00-INDEX.md` — navigation + autopilot protocol + session log. The session log at the bottom is the most important part of this file. Read every entry, in order, newest last. The newest entry tells you what the previous session decided and what you should pick up. If the newest entry contradicts your assumptions about priority, the newest entry wins.
2. `investax-docs/01-priority-and-execution.md` — master priority order. Priorities are numbered (0, 1, 1.5, 2, ...) and may have been inserted since you last looked. Read every priority, not just the first one.
3. `investax-docs/09-backlog-and-discipline.md` — the discipline rules. Apply Section 8.3 to yourself. If you catch yourself thinking "while I'm here I could also..." — stop, park the idea in Section 8.2, move on. Also scan Section 8.1 for backlog items with deadlines or "earliest start date" constraints — those are NOT available to pick up just because they look interesting.
4. `investax-docs/10-definition-of-ready.md` — the launch checklist. Cross-reference against this to find unchecked items. If Step 1 revealed a new priority that isn't in the DoR yet, add it as an unchecked item as part of your work.

## Step 2 — Figure out state

- Run `git log --oneline -30` and read recent commit messages
- Run `git status` — must be clean before starting work
- Compare against the priority order from step 1
- Identify the next highest-priority unchecked item that:
  - Has no unresolved blocking dependencies
  - Is in your scope (code work, not Dragos's bureaucracy track)
  - Is NOT parked in Section 8.1 with a future "earliest start date"
  - Is NOT parked in Section 8.2

## Step 3 — Before writing any code, read the spec completely

The index's "Working on... -> Read this file" table tells you which doc contains the detailed spec for your chosen task. Read that entire file section end-to-end before touching any code. Pay special attention to "DO NOT" lists, out-of-scope warnings, and verification steps. If the spec says "do not touch file X" — you do not touch file X, even if it would be helpful, even if it seems like a small fix.

## Step 4 — Plan and get approval

Tell me in 2-3 sentences:
- What you're working on and why it's the next priority
- Which spec file you read
- Branch name you'll create
- Brief implementation outline
- Any "DO NOT" constraints from the spec you're explicitly acknowledging

Wait for me to say "go". That's the only approval you need.

## Step 5 — Execute end-to-end

Follow the autopilot protocol in 00-INDEX.md (Phase 3 onwards): branch, execute, test, commit, PR, self-review. Don't skip steps. Don't commit to main directly.

## Step 6 — Auto-merge decision gate

After creating the PR and completing self-review, evaluate whether this PR qualifies for auto-merge. Auto-merge is ONLY allowed if ALL of the following are true:

1. All automated checks pass: `npm test`, `npm run lint`, `npm run typecheck` (or equivalent), `npm run build`. Zero errors, zero new warnings.
2. The PR does NOT modify any file in the PROTECTED LIST:
   - Any file in the tax engine directory (wherever the core calculation logic lives — grep for the FIFO logic or BNR rate fetching if unsure)
   - `taxe-romania-spec.md`
   - Any database migration file (`prisma/migrations/*`, schema changes)
   - Payment webhook handler (`/api/webhooks/lemon` or equivalent)
   - Auth logic (session handling, OAuth callbacks, password flows)
   - Any file matching `*secret*`, `*credential*`, `.env*`
   - `package.json` dependency section (new dependencies require human review)
3. The total diff is under 300 lines added/removed combined.
4. Self-review found zero issues (no leftover console.logs, no commented-out code, no hardcoded test values, no missing error handling, no accessibility regressions, no missing Romanian translations on user-facing strings).
5. Manual smoke test in Chrome DevTools (mobile viewport for any UI change) passed.
6. For any user-facing copy changes: Dragos's test case still produces the expected output (e.g., the 28,053 lei regression check for engine-adjacent work).

If ALL six conditions are met:
- Auto-merge via `gh pr merge --squash --delete-branch`
- Proceed to Step 7 (post-merge verification)
- Inform Dragos in the final session report that the PR was auto-merged under Mode B rules, with a one-line justification

If ANY condition fails:
- Do NOT merge
- Post the PR URL, self-review findings, and which condition(s) failed
- Explicitly state: "This PR requires human review because: [reason]"
- Stop and wait for Dragos

## Step 7 — Post-merge verification (only if auto-merged)

After merging:
1. `git checkout main && git pull origin main` — sync local main
2. `git log --oneline -3` — confirm the squash commit is on main
3. Deploy to production: `ssh investax@178.104.152.247 'cd ~/app && git pull origin main && npm run build && pm2 restart investax'`
4. Smoke test: `curl -s https://investax.app/api/health` — verify 200 response
5. If the change is UI-visible, visit https://investax.app and verify the change appears
6. If anything is broken, proceed to Step 7b (rollback)

## Step 7b — Rollback procedure (only if production smoke test fails)

1. Immediately: `git revert HEAD --no-edit && git push origin main`
2. Deploy the revert to production
3. Re-smoke-test production to confirm it's back to the previous working state
4. STOP. Do not attempt to fix the issue in the same session. Post a full incident report:
   - What was deployed
   - What broke
   - The revert commit hash
   - Your best guess at the root cause
   - What needs investigation before a retry
5. End the session. The next session (human-reviewed) picks up the fix.

## End of session protocol

1. Update `10-definition-of-ready.md` — check off completed items, add new ones discovered during work
2. Update the Session Log at the bottom of `00-INDEX.md` with a new entry:
   `YYYY-MM-DD | session #N | Claude Code | Completed: [what, with PR # and merge status] | Deployed: [yes/no/reverted] | Next: [what next session should pick up] | Notes: [any discoveries, blockers, new backlog items]`
3. Final plain-English report to Dragos:
   - What was done
   - Merge status (auto-merged under Mode B / awaiting human review / reverted)
   - Production smoke test result
   - What the next session should focus on
   - Any blockers or new risks discovered

## Three permanent rules

1. **Don't refactor working code.** If something works and isn't on the launch plan, leave it alone.
2. **Don't add features that aren't in the plan.** Park ideas in `09-backlog-and-discipline.md` Section 8.2.
3. **Don't touch files the spec says not to touch.** This includes `taxe-romania-spec.md` and the core tax engine unless the current task's spec explicitly scopes engine changes.

## When to stop and ask me

- The spec is ambiguous or contradicts another doc
- A task requires a decision not documented anywhere
- Tests fail and you can't figure out why after 3 attempts
- You'd need to touch a "do not touch" file to complete the task
- The newest session log entry contradicts the priority file and you can't tell which wins
- You discover the task is bigger than the spec implies

Otherwise: proceed autonomously.

$ARGUMENTS

Begin Step 1 now.
