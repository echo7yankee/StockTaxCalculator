import prisma from '../lib/prisma.js';

export type ParseAlertOutcome = 'ok' | 'warning' | 'error';

export interface LogParseAlertInput {
  userId?: string | null;
  fileType: 'pdf' | 'csv';
  fileName?: string | null;
  taxYear?: number | null;
  parserWarnings: string[];
  engineWarnings?: string[];
  errorMessage?: string | null;
  sellCount?: number | null;
  dividendCount?: number | null;
  distributionCount?: number | null;
  pageCount?: number | null;
}

// Translates the route's input outcome (success/warning/error) plus warning
// counts into the DB outcome enum (ok/warning/error). A 'success' POST with
// warnings.length > 0 collapses to 'warning'. Clients have been observed to
// report 'success' even when warnings are present, and the DB query layer
// should match the warning-count truth.
export function deriveParseOutcome(
  inputOutcome: 'success' | 'warning' | 'error',
  parserWarnings: string[],
  engineWarnings?: string[]
): ParseAlertOutcome {
  if (inputOutcome === 'error') return 'error';
  const total = parserWarnings.length + (engineWarnings?.length ?? 0);
  if (total > 0) return 'warning';
  return inputOutcome === 'warning' ? 'warning' : 'ok';
}

export async function logParseAlert(
  input: LogParseAlertInput & { outcome: ParseAlertOutcome }
) {
  return prisma.parseAlertLog.create({
    data: {
      userId: input.userId ?? null,
      fileType: input.fileType,
      fileName: input.fileName ?? null,
      taxYear: input.taxYear ?? null,
      outcome: input.outcome,
      parserWarnings: input.parserWarnings,
      engineWarnings: input.engineWarnings ?? [],
      errorMessage: input.errorMessage ?? null,
      sellCount: input.sellCount ?? null,
      dividendCount: input.dividendCount ?? null,
      distributionCount: input.distributionCount ?? null,
      pageCount: input.pageCount ?? null,
    },
  });
}
