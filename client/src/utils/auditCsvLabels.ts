import type { AuditTrailCsvLabels } from '@shared/index';

/**
 * Maps the i18n catalog to the shared {@link AuditTrailCsvLabels} the audit-CSV
 * serializer needs. Kept out of the component so the (large) label mapping lives
 * in one tested place and the component stays small. `t` is the react-i18next
 * translator already scoped to the `results` namespace at the call site.
 */
export function buildAuditTrailCsvLabels(t: (key: string) => string): AuditTrailCsvLabels {
  return {
    heading: t('results:auditCsvHeading'),
    metaFile: t('results:auditCsvFile'),
    metaTaxYear: t('results:auditCsvTaxYear'),
    metaBroker: t('results:auditCsvBroker'),
    metaMethodology: t('results:auditCsvMethodology'),
    methodologyNote: t('results:auditCsvMethodologyNote'),
    netSourceOverviewNote: t('results:auditCsvNetSourceOverview'),
    tradeSectionTitle: t('results:auditCsvTradesSection'),
    perSecuritySectionTitle: t('results:auditCsvSecuritiesSection'),
    summaryTitle: t('results:auditCsvSummarySection'),
    colDate: t('results:auditCsvColDate'),
    colType: t('results:auditCsvColType'),
    colTicker: t('results:auditCsvColTicker'),
    colIsin: t('results:auditCsvColIsin'),
    colName: t('results:auditCsvColName'),
    colShares: t('results:auditCsvColShares'),
    colPrice: t('results:auditCsvColPrice'),
    colCurrency: t('results:auditCsvColCurrency'),
    colAmountOriginal: t('results:auditCsvColAmountOriginal'),
    colBnrRate: t('results:auditCsvColBnrRate'),
    colAmountRon: t('results:auditCsvColAmountRon'),
    colWhtOriginal: t('results:auditCsvColWhtOriginal'),
    colWhtRon: t('results:auditCsvColWhtRon'),
    colSecSold: t('results:auditCsvColSold'),
    colSecAvgCost: t('results:auditCsvColAvgCost'),
    colSecProceeds: t('results:auditCsvColProceeds'),
    colSecCostBasis: t('results:auditCsvColCostBasis'),
    colSecGainLoss: t('results:auditCsvColGainLoss'),
    colSecDividends: t('results:auditCsvColDividends'),
    actionBuy: t('results:auditCsvActionBuy'),
    actionSell: t('results:auditCsvActionSell'),
    actionDividend: t('results:auditCsvActionDividend'),
    actionInterest: t('results:auditCsvActionInterest'),
    actionDeposit: t('results:auditCsvActionDeposit'),
    actionWithdrawal: t('results:auditCsvActionWithdrawal'),
    summaryColItem: t('results:auditCsvSumItem'),
    summaryColValue: t('results:auditCsvSumValue'),
    sumCapGainsProceeds: t('results:auditCsvSumCgProceeds'),
    sumCapGainsCostBasis: t('results:auditCsvSumCgCostBasis'),
    sumCapGainsNet: t('results:auditCsvSumCgNet'),
    sumCapGainsLosses: t('results:auditCsvSumCgLosses'),
    sumCapGainsRate: t('results:auditCsvSumCgRate'),
    sumCapGainsTax: t('results:auditCsvSumCgTax'),
    sumDivGross: t('results:auditCsvSumDivGross'),
    sumDivWht: t('results:auditCsvSumDivWht'),
    sumDivCredit: t('results:auditCsvSumDivCredit'),
    sumDivTax: t('results:auditCsvSumDivTax'),
    sumCassBase: t('results:auditCsvSumCassBase'),
    sumCassAmount: t('results:auditCsvSumCassAmount'),
    sumTotalTax: t('results:auditCsvSumTotalTax'),
    sumEarlyDiscount: t('results:auditCsvSumEarlyDiscount'),
    sumTotalAfterDiscount: t('results:auditCsvSumTotalAfterDiscount'),
  };
}
