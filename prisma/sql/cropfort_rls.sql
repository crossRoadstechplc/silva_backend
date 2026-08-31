-- Cropfort: budget VIEW and immutability trigger (run after Prisma migrate)

CREATE OR REPLACE VIEW budget_lines AS
SELECT
  abl."programId",
  abl."planYear",
  abl."blockId",
  abl."activityId",
  date_trunc('month', abl."plannedStart")::date AS budget_month,
  (abl."plannedQty" * COALESCE(am."laborNorm", 0) * rcl."rateEtb") AS labor_cost_etb,
  (abl."plannedQty" * COALESCE(am."materialNorm", 0) * rcl."rateEtb") AS material_cost_etb
FROM afp_block_lines abl
JOIN activity_master am ON am.id = abl."activityId"
JOIN rate_card_lines rcl ON rcl."programId" = abl."programId"
  AND rcl.status = 'approved'
WHERE abl.status = 'approved'
  AND abl."electionStatus" = 'elected';

CREATE OR REPLACE FUNCTION prevent_released_block_ticket_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'released' THEN
    RAISE EXCEPTION 'Released field tickets are immutable. Create a correcting ticket instead.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS block_field_tickets_immutable ON block_field_tickets;
  CREATE TRIGGER block_field_tickets_immutable
  BEFORE UPDATE ON block_field_tickets
  FOR EACH ROW EXECUTE FUNCTION prevent_released_block_ticket_update();

ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "cropfortOpexReserveBalanceEtb" DECIMAL(14,2);
