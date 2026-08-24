-- Item comments (Procore-style per-record threads)
CREATE TABLE "item_comments" (
    "id" TEXT NOT NULL,
    "programId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "item_comments_entityType_entityId_idx" ON "item_comments"("entityType", "entityId");
CREATE INDEX "item_comments_programId_idx" ON "item_comments"("programId");

ALTER TABLE "item_comments" ADD CONSTRAINT "item_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "item_comments" ADD CONSTRAINT "item_comments_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security (program isolation) — enable when DATABASE_URL uses a role subject to RLS
ALTER TABLE "afp_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "afes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "field_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "owner_settlements" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "afp_lines_program_isolation" ON "afp_lines"
  USING ("programId" = current_setting('app.program_id', true));

CREATE POLICY "afes_program_isolation" ON "afes"
  USING ("programId" = current_setting('app.program_id', true));

CREATE POLICY "work_orders_program_isolation" ON "work_orders"
  USING ("programId" = current_setting('app.program_id', true));

CREATE POLICY "field_tickets_program_isolation" ON "field_tickets"
  USING ("programId" = current_setting('app.program_id', true));

CREATE POLICY "payment_requests_program_isolation" ON "payment_requests"
  USING ("programId" = current_setting('app.program_id', true));

CREATE POLICY "owner_settlements_program_isolation" ON "owner_settlements"
  USING ("programId" = current_setting('app.program_id', true));
