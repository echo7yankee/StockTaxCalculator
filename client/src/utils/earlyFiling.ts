/**
 * Parses a country config's `earlyFilingDeadline` string (e.g. "April 15") and
 * returns whether "now" is still on or before that deadline in the current
 * calendar year. Used to gate the actionable "file early to save" banner on
 * ResultsPage so it hides once the deadline has passed.
 *
 * Returns true when deadline is in the future or today. Returns false when
 * today is past the deadline or when the deadline string cannot be parsed.
 */
const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

export function isBeforeEarlyFilingDeadline(
  deadline: string | undefined,
  now: Date = new Date()
): boolean {
  if (!deadline) return false;
  const match = deadline.trim().match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (!match) return false;
  const monthIdx = MONTHS[match[1].toLowerCase()];
  const day = parseInt(match[2], 10);
  if (monthIdx === undefined || !Number.isFinite(day)) return false;
  const deadlineDate = new Date(now.getFullYear(), monthIdx, day, 23, 59, 59, 999);
  return now.getTime() <= deadlineDate.getTime();
}
