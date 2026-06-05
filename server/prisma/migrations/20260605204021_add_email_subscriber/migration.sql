-- CreateTable
CREATE TABLE "EmailSubscriber" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ro',
    "source" TEXT,
    "confirmToken" TEXT,
    "confirmedAt" DATETIME,
    "unsubToken" TEXT NOT NULL,
    "unsubscribedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailSubscriber_confirmToken_key" ON "EmailSubscriber"("confirmToken");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSubscriber_unsubToken_key" ON "EmailSubscriber"("unsubToken");

-- CreateIndex
CREATE INDEX "EmailSubscriber_topic_idx" ON "EmailSubscriber"("topic");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSubscriber_email_topic_key" ON "EmailSubscriber"("email", "topic");
