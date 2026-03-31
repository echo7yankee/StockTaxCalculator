import { Router } from 'express';
import { getCountryConfig } from '@stock-tax-calculator/shared';

export const calculatorRouter = Router();

calculatorRouter.post('/quick', (req, res) => {
  const { capitalGains, dividends, withholdingTaxPaid, otherNonSalaryIncome, country } = req.body;

  const config = getCountryConfig(country || 'RO');
  if (!config) {
    res.status(400).json({ error: 'Unsupported country' });
    return;
  }

  const capitalGainsTax = Math.max(0, (capitalGains || 0) * config.capitalGainsTaxRate);
  const grossDividendTax = (dividends || 0) * config.dividendTaxRate;
  const dividendTax = Math.max(0, grossDividendTax - (withholdingTaxPaid || 0));

  const totalNonSalary = (capitalGains || 0) + (dividends || 0) + (otherNonSalaryIncome || 0);
  let healthContribution = 0;
  let bracketLabel = 'none';
  for (const bracket of config.healthContributionBrackets) {
    if (totalNonSalary >= bracket.minIncome && (bracket.maxIncome === null || totalNonSalary < bracket.maxIncome)) {
      healthContribution = bracket.fixedAmount;
      bracketLabel = bracket.label;
      break;
    }
  }

  const totalOwed = capitalGainsTax + dividendTax + healthContribution;
  const earlyFilingDiscount = (capitalGainsTax + dividendTax) * config.earlyFilingDiscountRate;

  res.json({
    capitalGainsTax,
    dividendTax,
    healthContribution,
    bracketLabel,
    totalOwed,
    earlyFilingDiscount,
    totalAfterDiscount: totalOwed - earlyFilingDiscount,
  });
});
