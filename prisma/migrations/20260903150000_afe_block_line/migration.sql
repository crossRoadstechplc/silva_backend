-- Link Field OS AFEs to Cropfort Block AFP (annual plan) lines
ALTER TABLE "afes" ADD COLUMN IF NOT EXISTS "afpBlockLineId" TEXT;

CREATE INDEX IF NOT EXISTS "afes_afpBlockLineId_idx" ON "afes"("afpBlockLineId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'afes_afpBlockLineId_fkey'
  ) THEN
    ALTER TABLE "afes"
      ADD CONSTRAINT "afes_afpBlockLineId_fkey"
      FOREIGN KEY ("afpBlockLineId") REFERENCES "afp_block_lines"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
