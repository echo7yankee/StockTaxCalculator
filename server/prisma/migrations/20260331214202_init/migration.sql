-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "googleId" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TaxYear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'RO',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxYear_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CsvUpload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taxYearId" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "filename" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "rowCount" INTEGER,
    CONSTRAINT "CsvUpload_taxYearId_fkey" FOREIGN KEY ("taxYearId") REFERENCES "TaxYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
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
    CONSTRAINT "Transaction_csvUploadId_fkey" FOREIGN KEY ("csvUploadId") REFERENCES "CsvUpload" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_taxYearId_fkey" FOREIGN KEY ("taxYearId") REFERENCES "TaxYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BnrRate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rateDate" DATETIME NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "TaxCalculation" (
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
    CONSTRAINT "TaxCalculation_taxYearId_fkey" FOREIGN KEY ("taxYearId") REFERENCES "TaxYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SecurityCalculation" (
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
    CONSTRAINT "SecurityCalculation_taxCalculationId_fkey" FOREIGN KEY ("taxCalculationId") REFERENCES "TaxCalculation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxYear_userId_year_key" ON "TaxYear"("userId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "BnrRate_rateDate_currency_key" ON "BnrRate"("rateDate", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCalculation_taxYearId_key" ON "TaxCalculation"("taxYearId");
