const { FARM_WORKFLOW_STAGES, stageOrder } = require("../../lib/cropfortWorkflowStages");

describe("farm workflow stages", () => {
  it("defines 10 ordered stages", () => {
    expect(FARM_WORKFLOW_STAGES).toHaveLength(10);
    expect(FARM_WORKFLOW_STAGES[0].key).toBe("farm_block_setup");
    expect(FARM_WORKFLOW_STAGES[9].key).toBe("monthly_client_report");
  });

  it("orders stages sequentially", () => {
    expect(stageOrder("benchmark_survey")).toBeGreaterThan(stageOrder("farm_block_setup"));
    expect(stageOrder("activity_plan")).toBeGreaterThan(stageOrder("tier_election"));
  });
});
