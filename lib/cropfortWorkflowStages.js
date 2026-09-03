/** Ordered Cropfort farm journey stages (spec §3). */
const FARM_WORKFLOW_STAGES = [
  { key: "farm_block_setup", label: "Farm & Block Setup", order: 1 },
  { key: "benchmark_survey", label: "Benchmark Rate Survey", order: 2 },
  { key: "rate_cards_confirmed", label: "Rate Cards Confirmed", order: 3 },
  { key: "fee_schedule_set", label: "Fee Schedule Set", order: 4, parallelAfter: "farm_block_setup" },
  { key: "tier_election", label: "Tier Election", order: 5 },
  { key: "activity_plan", label: "Activity Plan", order: 6 },
  { key: "master_plan_calendar", label: "Master Plan Calendar", order: 7, autoComplete: true },
  { key: "supervisor_progress", label: "Supervisor Progress", order: 8 },
  { key: "budgets_cash_flow", label: "Budgets & Cash Flow", order: 9, autoUnlockAfter: "activity_plan" },
  { key: "monthly_client_report", label: "Monthly Client Report", order: 10 },
];

const STAGE_KEYS = FARM_WORKFLOW_STAGES.map((s) => s.key);

function stageMeta(key) {
  return FARM_WORKFLOW_STAGES.find((s) => s.key === key);
}

function stageOrder(key) {
  return stageMeta(key)?.order ?? 99;
}

module.exports = { FARM_WORKFLOW_STAGES, STAGE_KEYS, stageMeta, stageOrder };
