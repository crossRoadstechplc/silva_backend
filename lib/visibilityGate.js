const { enrichRateCardLine } = require("../services/costDerivation.service");

const FARM_OWNER_VISIBLE_STATUSES = new Set(["approved", "released"]);

function filterStatusForFarmOwner(status) {
  return FARM_OWNER_VISIBLE_STATUSES.has(status);
}

function serializeRateCardLineForFarmOwner(line, thresholdPct) {
  const enriched = enrichRateCardLine(line, thresholdPct);
  return {
    id: enriched.id,
    resourceCode: enriched.resourceCode,
    resourceName: enriched.resourceName,
    unitOfMeasure: enriched.unitOfMeasure,
    rateEtb: enriched.rateEtb,
    status: enriched.status,
    version: enriched.version,
    effectiveFrom: enriched.effectiveFrom,
    effectiveTo: enriched.effectiveTo,
    approvedAt: enriched.approvedAt,
  };
}

function serializeRateCardLineForSpx(line, thresholdPct) {
  return enrichRateCardLine(line, thresholdPct);
}

function serializeAfpBlockLineForFarmOwner(line) {
  return {
    id: line.id,
    planYear: line.planYear,
    blockId: line.blockId,
    block: line.block,
    activityId: line.activityId,
    activity: line.activity
      ? { id: line.activity.id, code: line.activity.code, name: line.activity.name }
      : null,
    electionStatus: line.electionStatus,
    sequence: line.sequence,
    plannedStart: line.plannedStart,
    plannedEnd: line.plannedEnd,
    plannedQty: line.plannedQty != null ? Number(line.plannedQty) : null,
    status: line.status,
    version: line.version,
    approvedAt: line.approvedAt,
  };
}

function serializeAfpBlockLineForSpx(line) {
  return {
    id: line.id,
    programId: line.programId,
    planYear: line.planYear,
    blockId: line.blockId,
    block: line.block,
    activityId: line.activityId,
    activity: line.activity
      ? {
          id: line.activity.id,
          code: line.activity.code,
          name: line.activity.name,
          laborNorm: line.activity.laborNorm != null ? Number(line.activity.laborNorm) : null,
          materialNorm: line.activity.materialNorm != null ? Number(line.activity.materialNorm) : null,
          serviceNorm: line.activity.serviceNorm != null ? Number(line.activity.serviceNorm) : null,
        }
      : null,
    electionStatus: line.electionStatus,
    sequence: line.sequence,
    plannedStart: line.plannedStart,
    plannedEnd: line.plannedEnd,
    plannedQty: line.plannedQty != null ? Number(line.plannedQty) : null,
    status: line.status,
    version: line.version,
    returnedComment: line.returnedComment,
    submittedAt: line.submittedAt,
    approvedAt: line.approvedAt,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  };
}

function serializeBlockFieldTicketForFarmOwner(line) {
  return stripBAgroAttribution({
    id: line.id,
    blockId: line.blockId,
    block: line.block,
    activityId: line.activityId,
    activity: line.activity
      ? { id: line.activity.id, code: line.activity.code, name: line.activity.name }
      : null,
    weekEnding: line.weekEnding,
    actualQty: line.actualQty != null ? Number(line.actualQty) : null,
    laborHoursActual: line.laborHoursActual != null ? Number(line.laborHoursActual) : null,
    status: line.status,
    releasedAt: line.releasedAt,
  });
}

function serializeBlockFieldTicketForOps(line) {
  return {
    id: line.id,
    programId: line.programId,
    blockId: line.blockId,
    block: line.block,
    activityId: line.activityId,
    activity: line.activity,
    weekEnding: line.weekEnding,
    plannedQty: line.plannedQty != null ? Number(line.plannedQty) : null,
    actualQty: line.actualQty != null ? Number(line.actualQty) : null,
    laborHoursActual: line.laborHoursActual != null ? Number(line.laborHoursActual) : null,
    materialsUsed: line.materialsUsed,
    evidenceUrls: line.evidenceUrls,
    clientLocalId: line.clientLocalId,
    spxNote: line.spxNote,
    status: line.status,
    supersedesId: line.supersedesId,
    submittedAt: line.submittedAt,
    releasedAt: line.releasedAt,
    submittedByUserId: line.submittedByUserId,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  };
}

function stripBAgroAttribution(row) {
  if (!row || typeof row !== "object") return row;
  const copy = { ...row };
  delete copy.submittedByUserId;
  delete copy.submittedBy;
  delete copy.spxNote;
  delete copy.clientLocalId;
  delete copy.evidenceUrls;
  delete copy.benchmarkFarmARate;
  delete copy.benchmarkFarmBRate;
  delete copy.variancePct;
  delete copy.isFlagged;
  delete copy.spxJustificationNote;
  return copy;
}

function applyFarmOwnerListFilter(where, isFarmOwner) {
  if (!isFarmOwner) return where;
  return { ...where, status: { in: ["approved"] } };
}

function applyReleasedOnlyFilter(where, isFarmOwner) {
  if (!isFarmOwner) return where;
  return { ...where, status: "released" };
}

module.exports = {
  FARM_OWNER_VISIBLE_STATUSES,
  filterStatusForFarmOwner,
  serializeRateCardLineForFarmOwner,
  serializeRateCardLineForSpx,
  serializeAfpBlockLineForFarmOwner,
  serializeAfpBlockLineForSpx,
  serializeBlockFieldTicketForFarmOwner,
  serializeBlockFieldTicketForOps,
  stripBAgroAttribution,
  applyFarmOwnerListFilter,
  applyReleasedOnlyFilter,
};
