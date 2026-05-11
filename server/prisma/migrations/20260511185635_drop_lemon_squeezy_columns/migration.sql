-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "planPurchasedAt" DATETIME,
    "planExpiresAt" DATETIME,
    "stripeCustomerId" TEXT,
    "stripePaymentIntentId" TEXT,
    "launchPriceUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "googleId", "id", "launchPriceUsed", "name", "passwordHash", "plan", "planExpiresAt", "planPurchasedAt", "stripeCustomerId", "stripePaymentIntentId", "updatedAt") SELECT "createdAt", "email", "googleId", "id", "launchPriceUsed", "name", "passwordHash", "plan", "planExpiresAt", "planPurchasedAt", "stripeCustomerId", "stripePaymentIntentId", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
