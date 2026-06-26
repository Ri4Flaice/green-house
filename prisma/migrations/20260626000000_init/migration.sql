CREATE TYPE "BroadcastStatus" AS ENUM ('CREATED', 'SENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'SUCCESS', 'ERROR', 'SKIPPED');
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

CREATE TABLE "Broadcast" (
  "id" TEXT NOT NULL,
  "userEmail" TEXT NOT NULL,
  "spreadsheetId" TEXT NOT NULL,
  "spreadsheetName" TEXT NOT NULL,
  "sheetTitles" JSONB NOT NULL,
  "status" "BroadcastStatus" NOT NULL DEFAULT 'CREATED',
  "totalCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BroadcastRecipient" (
  "id" TEXT NOT NULL,
  "broadcastId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "clientName" TEXT NOT NULL,
  "rawName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "sourceLabel" TEXT NOT NULL,
  "sheetTitles" JSONB NOT NULL,
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "cashTotal" INTEGER NOT NULL DEFAULT 0,
  "remoteTotal" INTEGER NOT NULL DEFAULT 0,
  "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
  "idMessage" TEXT,
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppLog" (
  "id" TEXT NOT NULL,
  "level" "LogLevel" NOT NULL DEFAULT 'ERROR',
  "endpoint" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "userEmail" TEXT,
  "context" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AppLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Broadcast_userEmail_createdAt_idx" ON "Broadcast"("userEmail", "createdAt");
CREATE INDEX "Broadcast_status_createdAt_idx" ON "Broadcast"("status", "createdAt");
CREATE UNIQUE INDEX "BroadcastRecipient_broadcastId_invoiceId_key" ON "BroadcastRecipient"("broadcastId", "invoiceId");
CREATE INDEX "BroadcastRecipient_broadcastId_status_idx" ON "BroadcastRecipient"("broadcastId", "status");
CREATE INDEX "BroadcastRecipient_phone_idx" ON "BroadcastRecipient"("phone");
CREATE INDEX "AppLog_level_createdAt_idx" ON "AppLog"("level", "createdAt");
CREATE INDEX "AppLog_endpoint_createdAt_idx" ON "AppLog"("endpoint", "createdAt");

ALTER TABLE "BroadcastRecipient"
  ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey"
  FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
