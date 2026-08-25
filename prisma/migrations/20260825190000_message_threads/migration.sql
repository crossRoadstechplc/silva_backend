-- CreateEnum
CREATE TYPE "MessageCounterpartyType" AS ENUM ('vendor', 'asset_owner');

-- CreateEnum
CREATE TYPE "MessageThreadStatus" AS ENUM ('open', 'archived');

-- CreateTable
CREATE TABLE "message_threads" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "spxOrganizationId" TEXT NOT NULL,
    "counterpartyOrganizationId" TEXT NOT NULL,
    "counterpartyType" "MessageCounterpartyType" NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "MessageThreadStatus" NOT NULL DEFAULT 'open',
    "entityType" TEXT,
    "entityId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "senderOrganizationId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_thread_reads" (
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_thread_reads_pkey" PRIMARY KEY ("threadId","userId")
);

-- CreateIndex
CREATE INDEX "message_threads_programId_counterpartyOrganizationId_idx" ON "message_threads"("programId", "counterpartyOrganizationId");

-- CreateIndex
CREATE INDEX "message_threads_programId_lastMessageAt_idx" ON "message_threads"("programId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "message_threads_programId_counterpartyType_idx" ON "message_threads"("programId", "counterpartyType");

-- CreateIndex
CREATE INDEX "messages_threadId_createdAt_idx" ON "messages"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_spxOrganizationId_fkey" FOREIGN KEY ("spxOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_counterpartyOrganizationId_fkey" FOREIGN KEY ("counterpartyOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderOrganizationId_fkey" FOREIGN KEY ("senderOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_thread_reads" ADD CONSTRAINT "message_thread_reads_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_thread_reads" ADD CONSTRAINT "message_thread_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
