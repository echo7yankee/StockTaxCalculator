-- CreateTable
CREATE TABLE "ParseAlertLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "parsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileType" TEXT NOT NULL,
    "fileName" TEXT,
    "taxYear" INTEGER,
    "outcome" TEXT NOT NULL,
    "parserWarnings" JSONB NOT NULL,
    "engineWarnings" JSONB NOT NULL,
    "errorMessage" TEXT,
    "sellCount" INTEGER,
    "dividendCount" INTEGER,
    "distributionCount" INTEGER,
    "pageCount" INTEGER,
    CONSTRAINT "ParseAlertLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ParseAlertLog_parsedAt_idx" ON "ParseAlertLog"("parsedAt");

-- CreateIndex
CREATE INDEX "ParseAlertLog_userId_parsedAt_idx" ON "ParseAlertLog"("userId", "parsedAt");

-- CreateIndex
CREATE INDEX "ParseAlertLog_outcome_idx" ON "ParseAlertLog"("outcome");
