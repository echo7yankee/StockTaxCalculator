#!/usr/bin/env tsx
/**
 * Manual launch-verification prompter (`npm run verify:manual -- <suite>`).
 *
 * Walks Dragos (or any human tester) through a device-specific checklist, one
 * item at a time, and writes a timestamped markdown report into
 * `scripts/reports/`. Companion to `npm run verify` (automated) from PR-A.
 *
 * Suites:
 *   ios       iPhone + Safari 17+ manual checks
 *   android   Android + Chrome 120+ manual checks
 *   email     Transactional email deliverability + rendering (stub until
 *             Resend is live — most items will be skip-expected)
 *   payment   Real-money payment flow walkthrough (stub — blocked on
 *             backlog item #14 and LS live-mode approval)
 *
 * Per-item answers:
 *   Y  pass
 *   N  fail (prompter captures a one-line note)
 *   S  skip (captures optional reason)
 *   Q  quit — report still writes with remaining items marked pending
 *
 * Exit code is non-zero if any item was marked N. Skipped / pending do not
 * fail the run.
 *
 * Part of PR-B of the launch-verification tooling
 * (09-backlog-and-discipline.md Section 8.1 item #15).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
// @ts-expect-error — enquirer ships CommonJS without ambient TS types.
import enquirer from 'enquirer';

type Answer = 'Y' | 'N' | 'S' | 'Q';

type Suite = 'ios' | 'android' | 'email' | 'payment';

type ChecklistItem = {
  number: number;
  title: string;
  body: string;
};

type ItemResult = {
  item: ChecklistItem;
  answer: Answer | 'pending';
  note: string;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CHECKLIST_DIR = join(SCRIPT_DIR, 'checklists');
const REPORT_DIR = join(SCRIPT_DIR, 'reports');

const SUITE_META: Record<Suite, { label: string; file: string | null }> = {
  ios: { label: 'iOS Safari', file: 'ios.md' },
  android: { label: 'Android Chrome', file: 'android.md' },
  email: { label: 'Email deliverability', file: 'email.md' },
  payment: { label: 'Payment flow (stub)', file: null },
};

function parseChecklist(markdown: string): ChecklistItem[] {
  // Item headers look like: `N. **Title.** rest...`
  const lines = markdown.split('\n');
  const items: ChecklistItem[] = [];
  let current: ChecklistItem | null = null;

  for (const line of lines) {
    const header = line.match(/^(\d+)\.\s+\*\*([^*]+?)\*\*\s*(.*)$/);
    if (header) {
      if (current) items.push(current);
      current = {
        number: parseInt(header[1], 10),
        title: header[2].replace(/[.:]\s*$/, ''),
        body: header[3].trim(),
      };
      continue;
    }
    if (current) {
      // Item body continues until the next blank-line-separated non-indented
      // block or next numbered header. We stop collecting when we hit the
      // "Out of scope" section or a `---` divider.
      if (/^---\s*$/.test(line) || /^##\s+Out of scope/i.test(line)) {
        items.push(current);
        current = null;
        break;
      }
      if (line.trim().length > 0) {
        current.body = `${current.body}${current.body ? ' ' : ''}${line.trim()}`;
      }
    }
  }
  if (current) items.push(current);
  return items;
}

async function ask<T>(opts: unknown): Promise<T> {
  // enquirer types are awkward; cast through unknown.
  const prompt = (enquirer as unknown as { prompt: (o: unknown) => Promise<Record<string, T>> }).prompt;
  const answer = await prompt(opts);
  return (answer as Record<string, T>).value;
}

async function askAnswer(): Promise<Answer> {
  const raw = await ask<string>({
    type: 'select',
    name: 'value',
    message: 'Result',
    choices: [
      { name: 'Y', message: 'Y — passed' },
      { name: 'N', message: 'N — failed' },
      { name: 'S', message: 'S — skip' },
      { name: 'Q', message: 'Q — quit and save partial report' },
    ],
  });
  return raw as Answer;
}

async function askNote(label: string): Promise<string> {
  const note = await ask<string>({
    type: 'input',
    name: 'value',
    message: label,
  });
  return (note || '').trim();
}

function printItemHeader(item: ChecklistItem, index: number, total: number): void {
  console.log(chalk.bold(`\n[${index + 1}/${total}] ${chalk.cyan(`#${item.number}`)} ${item.title}`));
  if (item.body) {
    console.log(chalk.dim(`  ${item.body.replace(/\s+/g, ' ')}`));
  }
}

function badge(answer: Answer | 'pending'): string {
  switch (answer) {
    case 'Y':
      return chalk.green('✓ PASS');
    case 'N':
      return chalk.red('✗ FAIL');
    case 'S':
      return chalk.yellow('○ SKIP');
    case 'Q':
      return chalk.gray('⏹ QUIT');
    default:
      return chalk.gray('… pending');
  }
}

function isoTimestamp(d = new Date()): string {
  return d.toISOString().replace(/[:.]/g, '-');
}

function writeReport(suite: Suite, results: ItemResult[]): string {
  mkdirSync(REPORT_DIR, { recursive: true });
  const ts = isoTimestamp();
  const file = join(REPORT_DIR, `verify-manual-${suite}-${ts}.md`);

  const counts = {
    pass: results.filter((r) => r.answer === 'Y').length,
    fail: results.filter((r) => r.answer === 'N').length,
    skip: results.filter((r) => r.answer === 'S').length,
    quit: results.filter((r) => r.answer === 'Q').length,
    pending: results.filter((r) => r.answer === 'pending').length,
  };

  const lines: string[] = [];
  lines.push(`# verify:manual — ${SUITE_META[suite].label}`);
  lines.push('');
  lines.push(`- **Timestamp:** ${new Date().toISOString()}`);
  lines.push(`- **Suite:** \`${suite}\``);
  lines.push(
    `- **Summary:** ${counts.pass} pass, ${counts.fail} fail, ${counts.skip} skip, ${counts.quit} quit, ${counts.pending} pending`,
  );
  lines.push('');
  lines.push('## Results');
  lines.push('');
  for (const r of results) {
    const mark =
      r.answer === 'Y'
        ? 'PASS'
        : r.answer === 'N'
          ? 'FAIL'
          : r.answer === 'S'
            ? 'SKIP'
            : r.answer === 'Q'
              ? 'QUIT'
              : 'PENDING';
    lines.push(`### ${mark} — #${r.item.number} ${r.item.title}`);
    if (r.note) {
      lines.push('');
      lines.push(`> ${r.note}`);
    }
    lines.push('');
  }

  writeFileSync(file, lines.join('\n'));
  return file;
}

async function runSuite(suite: Suite): Promise<number> {
  const meta = SUITE_META[suite];
  console.log(chalk.bold(`\nverify:manual — ${meta.label}`));

  if (!meta.file) {
    console.log(
      chalk.yellow(
        '\nThis suite is a stub. Payment-flow walkthrough is blocked on ' +
          'backlog item #14 (interactive payment verification harness) and ' +
          'LS live-mode approval. Re-run once those land.\n',
      ),
    );
    // Still drop a report so the run is traceable.
    const stubItem: ChecklistItem = {
      number: 1,
      title: 'Payment flow — stub pending backlog #14',
      body: 'See 09-backlog-and-discipline.md Section 8.1 item #14.',
    };
    writeReport(suite, [{ item: stubItem, answer: 'pending', note: 'Blocked — tool not yet built.' }]);
    return 0;
  }

  const markdown = readFileSync(join(CHECKLIST_DIR, meta.file), 'utf8');
  const items = parseChecklist(markdown);
  if (items.length === 0) {
    console.log(chalk.red(`No checklist items found in ${meta.file}. Check the parser.`));
    return 2;
  }

  console.log(chalk.dim(`Loaded ${items.length} items from ${meta.file}.\n`));

  const results: ItemResult[] = items.map((item) => ({ item, answer: 'pending', note: '' }));
  let quit = false;

  for (let i = 0; i < items.length; i += 1) {
    if (quit) break;
    const item = items[i];
    printItemHeader(item, i, items.length);

    let answer: Answer;
    try {
      answer = await askAnswer();
    } catch {
      // enquirer throws on Ctrl+C — treat as quit
      answer = 'Q';
    }

    let note = '';
    if (answer === 'N') {
      note = await askNote('What went wrong? (one line)');
    } else if (answer === 'S') {
      note = await askNote('Reason for skip (optional, ENTER to skip)');
    }

    results[i] = { item, answer, note };
    if (answer === 'Q') quit = true;
  }

  // Summary
  console.log(chalk.bold('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.bold('  verify:manual — Results'));
  console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  for (const r of results) {
    console.log(`  ${badge(r.answer)}  #${r.item.number} ${r.item.title}${r.note ? chalk.dim(` — ${r.note}`) : ''}`);
  }
  console.log(chalk.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

  const reportPath = writeReport(suite, results);
  console.log(chalk.cyan(`Report written: ${resolve(reportPath)}`));

  const fails = results.filter((r) => r.answer === 'N').length;
  if (fails > 0) {
    console.log(chalk.red(`\n${fails} item(s) failed.\n`));
    return 1;
  }
  console.log(chalk.green('\nNo failures recorded.\n'));
  return 0;
}

function usage(): void {
  console.log(
    [
      '',
      'Usage: npm run verify:manual -- <suite>',
      '',
      'Suites:',
      '  ios       iOS Safari manual checklist',
      '  android   Android Chrome manual checklist',
      '  email     Email deliverability checklist (stub until Resend live)',
      '  payment   Payment flow walkthrough (stub — blocked on backlog #14)',
      '',
    ].join('\n'),
  );
}

async function main() {
  const suiteArg = process.argv.slice(2).find((a) => !a.startsWith('-'));
  if (!suiteArg) {
    usage();
    process.exit(2);
  }
  if (!(suiteArg in SUITE_META)) {
    console.error(chalk.red(`Unknown suite: ${suiteArg}`));
    usage();
    process.exit(2);
  }
  const code = await runSuite(suiteArg as Suite);
  process.exit(code);
}

main().catch((err) => {
  console.error(chalk.red('\nverify-manual.ts crashed:'), err);
  process.exit(2);
});
