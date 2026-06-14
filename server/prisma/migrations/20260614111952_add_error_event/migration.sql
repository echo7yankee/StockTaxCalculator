-- CreateTable
CREATE TABLE "ErrorEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'server',
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sampleStack" TEXT,
    "context" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ErrorEvent_fingerprint_key" ON "ErrorEvent"("fingerprint");

-- CreateIndex
CREATE INDEX "ErrorEvent_lastSeen_idx" ON "ErrorEvent"("lastSeen");

-- CreateIndex
CREATE INDEX "ErrorEvent_source_lastSeen_idx" ON "ErrorEvent"("source", "lastSeen");
