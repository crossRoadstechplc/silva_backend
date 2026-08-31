const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");
const auditCropfort = require("../services/cropfort/auditCropfort.service");

const ID_PREFIX = {
  rate_card_line: "rcl",
  afp_block_line: "abl",
  cropfort_afe: "caf",
};

const MODEL_MAP = {
  rate_card_line: {
    table: "rate_card_lines",
    objectType: "rate_card_line",
  },
  afp_block_line: {
    table: "afp_block_lines",
    objectType: "afp_block_line",
  },
  cropfort_afe: {
    table: "cropfort_afes",
    objectType: "cropfort_afe",
  },
};

function getDelegate(objectType) {
  const cfg = MODEL_MAP[objectType];
  if (!cfg) throw new AppError(400, "INVALID_OBJECT", `Unknown approvable type: ${objectType}`);
  return { cfg, delegate: prisma[cfg.table] };
}

async function submitLines(objectType, lineIds, user, programId) {
  const { delegate, cfg } = getDelegate(objectType);
  const lines = await delegate.findMany({
    where: { id: { in: lineIds }, programId, status: "draft" },
  });
  if (lines.length !== lineIds.length) {
    throw new AppError(400, "INVALID_STATE", "All lines must be in draft status to submit.");
  }
  const now = new Date();
  await delegate.updateMany({
    where: { id: { in: lineIds }, programId },
    data: { status: "submitted", submittedAt: now },
  });
  for (const line of lines) {
    await auditCropfort.log(user.id, programId, cfg.objectType, line.id, "submitted", line, {
      ...line,
      status: "submitted",
    });
  }
  return delegate.findMany({ where: { id: { in: lineIds } } });
}

async function approveLine(objectType, lineId, user, programId, _comment) {
  const { delegate, cfg } = getDelegate(objectType);
  const line = await delegate.findFirst({ where: { id: lineId, programId, status: "submitted" } });
  if (!line) throw new AppError(404, "NOT_FOUND", "Line not found or not in submitted status.");
  const now = new Date();
  const updated = await delegate.update({
    where: { id: lineId },
    data: { status: "approved", approvedAt: now },
  });
  await auditCropfort.log(user.id, programId, cfg.objectType, lineId, "approved", line, updated);
  return updated;
}

async function returnLine(objectType, lineId, user, programId, comment) {
  if (!comment || !String(comment).trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "Return comment is required.");
  }
  const { delegate, cfg } = getDelegate(objectType);
  const line = await delegate.findFirst({ where: { id: lineId, programId, status: "submitted" } });
  if (!line) throw new AppError(404, "NOT_FOUND", "Line not found or not in submitted status.");
  const updated = await delegate.update({
    where: { id: lineId },
    data: { status: "returned", returnedComment: String(comment).trim() },
  });
  await auditCropfort.log(user.id, programId, cfg.objectType, lineId, "returned", line, updated);
  return updated;
}

async function reopenReturnedLine(objectType, lineId, user, programId, patchData) {
  const { delegate, cfg } = getDelegate(objectType);
  const line = await delegate.findFirst({ where: { id: lineId, programId, status: "returned" } });
  if (!line) throw new AppError(404, "NOT_FOUND", "Line not found or not in returned status.");

  const newId = uuid(ID_PREFIX[objectType] || "ln");
  const newLine = await delegate.create({
    data: {
      ...patchData,
      id: newId,
      programId,
      version: line.version + 1,
      supersedesId: line.id,
      status: "draft",
      createdByUserId: user.id,
      returnedComment: null,
      submittedAt: null,
      approvedAt: null,
    },
  });
  await auditCropfort.log(user.id, programId, cfg.objectType, newId, "created", null, newLine);
  return newLine;
}

function aggregateStatus(lines) {
  if (!lines.length) return "draft";
  if (lines.every((l) => l.status === "approved")) return "approved";
  if (lines.some((l) => l.status === "returned")) return "returned";
  if (lines.some((l) => l.status === "submitted")) return "submitted";
  return "draft";
}

module.exports = {
  submitLines,
  approveLine,
  returnLine,
  reopenReturnedLine,
  aggregateStatus,
};
