const { activityTierFromCode } = require("./cropfortCategoryWindows");

/**
 * Whether an election is actually in force (spec §2.6).
 *
 * Tier 1 is the core bundle: a block/activity row inherits the farm's bundle
 * tick unless it carries an explicit override. Tier 2 and Tier 3 are farm-wide
 * and must be elected individually, so they need an explicit true.
 */
function isElectionActive(farm, election) {
  const tier = activityTierFromCode(election?.activity?.code);
  if (tier === "tier1") {
    if (election.electionOverride != null) return election.electionOverride;
    return Boolean(farm?.coreBundleElected);
  }
  return Boolean(election?.electionOverride);
}

/**
 * Build a predicate for a set of plans, keyed by the election each plan hangs
 * off. Plans with no election row are treated as not elected so that costs
 * can never enter a rollup without an election backing them.
 */
function electedPlanFilter(farm) {
  return (plan) => {
    if (!plan.election) return false;
    const election = {
      ...plan.election,
      activity: plan.election.activity || plan.activity,
    };
    return isElectionActive(farm, election);
  };
}

module.exports = { isElectionActive, electedPlanFilter };
