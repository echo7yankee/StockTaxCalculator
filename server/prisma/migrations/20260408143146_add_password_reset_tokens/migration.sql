-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sid" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CsvUpload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taxYearId" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "filename" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "rowCount" INTEGER,
    CONSTRAINT "CsvUpload_taxYearId_fkey" FOREIGN KEY ("taxYearId") REFERENCES "TaxYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CsvUpload" ("broker", "filename", "id", "processed", "rowCount", "taxYearId", "uploadedAt") SELECT "broker", "filename", "id", "processed", "rowCount", "taxYearId", "uploadedAt" FROM "CsvUpload";
DROP TABLE "CsvUpload";
ALTER TABLE "new_CsvUpload" RENAME TO "CsvUpload";
CREATE INDEX "CsvUpload_taxYearId_idx" ON "CsvUpload"("taxYearId");
CREATE TABLE "new_SecurityCalculation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taxCalculationId" TEXT NOT NULL,
    "isin" TEXT,
    "ticker" TEXT,
    "securityName" TEXT,
    "totalBoughtShares" REAL,
    "totalSoldShares" REAL,
    "remainingShares" REAL,
    "weightedAvgCost" REAL,
    "totalProceeds" REAL,
    "totalCostBasis" REAL,
    "realizedGainLoss" REAL,
    "totalDividends" REAL,
    "totalWithholdingTax" REAL,
    CONSTRAINT "SecurityCalculation_taxCalculationId_fkey" FOREIGN KEY ("taxCalculationId") REFERENCES "TaxCalculation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SecurityCalculation" ("id", "isin", "realizedGainLoss", "remainingShares", "securityName", "taxCalculationId", "ticker", "totalBoughtShares", "totalCostBasis", "totalDividends", "totalProceeds", "totalSoldShares", "totalWithholdingTax", "weightedAvgCost") SELECT "id", "isin", "realizedGainLoss", "remainingShares", "securityName", "taxCalculationId", "ticker", "totalBoughtShares", "totalCostBasis", "totalDividends", "totalProceeds", "totalSoldShares", "totalWithholdingTax", "weightedAvgCost" FROM "SecurityCalculation";
DROP TABLE "SecurityCalculation";
ALTER TABLE "new_SecurityCalculation" RENAME TO "SecurityCalculation";
CREATE TABLE "new_TaxCalculation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taxYearId" TEXT NOT NULL,
    "totalCapitalGains" REAL,
    "totalCapitalLosses" REAL,
    "netCapitalGains" REAL,
    "capitalGainsTax" REAL,
    "totalDividendsGross" REAL,
    "totalWithholdingTax" REAL,
    "dividendTaxOwed" REAL,
    "totalNonSalaryIncome" REAL,
    "cassOwed" REAL,
    "cassThresholdHit" TEXT,
    "totalTaxOwed" REAL,
    "earlyFilingDiscount" REAL,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxCalculation_taxYearId_fkey" FOREIGN KEY ("taxYearId") REFERENCES "TaxYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TaxCalculation" ("calculatedAt", "capitalGainsTax", "cassOwed", "cassThresholdHit", "dividendTaxOwed", "earlyFilingDiscount", "id", "netCapitalGains", "taxYearId", "totalCapitalGains", "totalCapitalLosses", "totalDividendsGross", "totalNonSalaryIncome", "totalTaxOwed", "totalWithholdingTax") SELECT "calculatedAt", "capitalGainsTax", "cassOwed", "cassThresholdHit", "dividendTaxOwed", "earlyFilingDiscount", "id", "netCapitalGains", "taxYearId", "totalCapitalGains", "totalCapitalLosses", "totalDividendsGross", "totalNonSalaryIncome", "totalTaxOwed", "totalWithholdingTax" FROM "TaxCalculation";
DROP TABLE "TaxCalculation";
ALTER TABLE "new_TaxCalculation" RENAME TO "TaxCalculation";
CREATE UNIQUE INDEX "TaxCalculation_taxYearId_key" ON "TaxCalculation"("taxYearId");
CREATE TABLE "new_TaxYear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'RO',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxYear_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TaxYear" ("country", "createdAt", "id", "status", "userId", "year") SELECT "country", "createdAt", "id", "status", "userId", "year" FROM "TaxYear";
DROP TABLE "TaxYear";
ALTER TABLE "new_TaxYear" RENAME TO "TaxYear";
CREATE INDEX "TaxYear_userId_idx" ON "TaxYear"("userId");
CREATE UNIQUE INDEX "TaxYear_userId_year_key" ON "TaxYear"("userId", "year");
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "csvUploadId" TEXT NOT NULL,
    "taxYearId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "transactionDate" DATETIME NOT NULL,
    "isin" TEXT,
    "ticker" TEXT,
    "securityName" TEXT,
    "shares" REAL,
    "pricePerShare" REAL,
    "priceCurrency" TEXT,
    "totalAmountOriginal" REAL,
    "exchangeRateToLocal" REAL,
    "totalAmountLocal" REAL,
    "withholdingTaxOriginal" REAL,
    "withholdingTaxCurrency" TEXT,
    "withholdingTaxLocal" REAL,
    "brokerTransactionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_csvUploadId_fkey" FOREIGN KEY ("csvUploadId") REFERENCES "CsvUpload" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_taxYearId_fkey" FOREIGN KEY ("taxYearId") REFERENCES "TaxYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("action", "brokerTransactionId", "createdAt", "csvUploadId", "exchangeRateToLocal", "id", "isin", "priceCurrency", "pricePerShare", "securityName", "shares", "taxYearId", "ticker", "totalAmountLocal", "totalAmountOriginal", "transactionDate", "withholdingTaxCurrency", "withholdingTaxLocal", "withholdingTaxOriginal") SELECT "action", "brokerTransactionId", "createdAt", "csvUploadId", "exchangeRateToLocal", "id", "isin", "priceCurrency", "pricePerShare", "securityName", "shares", "taxYearId", "ticker", "totalAmountLocal", "totalAmountOriginal", "transactionDate", "withholdingTaxCurrency", "withholdingTaxLocal", "withholdingTaxOriginal" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_taxYearId_idx" ON "Transaction"("taxYearId");
CREATE INDEX "Transaction_csvUploadId_idx" ON "Transaction"("csvUploadId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Session_sid_key" ON "Session"("sid");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
