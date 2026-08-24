const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");
const { decimal, parseListQuery, meta } = require("../utils/helpers");
const { isVendorRole, isSpxRole } = require("../utils/roles");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");
const workPlanImport = require("./workPlanImport.service");
const workPlanPromote = require("./workPlanPromote.service");
const farmEstateService = require("./farmEstate.service");
const farmEstateScope = require("./utils/farmEstateScope");
const notify = require("./workflowNotifications.service");

const submissionInclude = {
  vendor: true,
  farmEstate: {
    include: {
      blocks: { orderBy: { code: "asc" } },
      vendorMaps: { include: { vendor: true } },
    },
  },
};

function submissionJson(row) {
  return {
    id: row.id,
    programId: row.programId,
    vendorId: row.vendorId,
    farmEstateId: row.farmEstateId ?? null,
    farmName: row.farmName ?? row.farmEstate?.name ?? null,
    totalAreaHa:
      row.totalAreaHa != null
        ? Number(row.totalAreaHa)
        : row.farmEstate?.totalAreaHa != null
          ? Number(row.farmEstate.totalAreaHa)
          : null,
    budgetYearLabel: row.budgetYearLabel,
    budgetYearGc: row.budgetYearGc,
    status: row.status,
    fxEtbPerUsd: Number(row.fxEtbPerUsd),
    parsedJson: row.parsedJson,
    sourceAttachmentId: row.sourceAttachmentId,
    submittedAt: row.submittedAt?.toISOString() || null,
    submittedByUserId: row.submittedByUserId,
    reviewedAt: row.reviewedAt?.toISOString() || null,
    reviewedByUserId: row.reviewedByUserId,
    reviewNotes: row.reviewNotes,
    promotedAt: row.promotedAt?.toISOString() || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    vendor: row.vendor ? { id: row.vendor.id, name: row.vendor.name } : undefined,
    farmEstate: row.farmEstate
      ? {
          id: row.farmEstate.id,
          name: row.farmEstate.name,
          totalAreaHa: row.farmEstate.totalAreaHa != null ? Number(row.farmEstate.totalAreaHa) : null,
          location: row.farmEstate.location,
          status: row.farmEstate.status,
          blocks: (row.farmEstate.blocks || []).map((b) => ({
            id: b.id,
            code: b.code,
            label: b.label,
            areaHa: b.areaHa != null ? Number(b.areaHa) : null,
            treeCount: b.treeCount,
          })),
        }
      : undefined,
  };
}

async function applyEstateToSubmission(dto, user, programId) {
  if (!dto.farmEstateId) {
    throw new AppError(400, "FARM_REQUIRED", "Select a farm estate for this work plan.");
  }
  const estate = await farmEstateService.assertVendorEstateAccess(dto.farmEstateId, user.vendorId, programId);
  return {
    farmEstateId: estate.id,
    farmName: estate.name,
    totalAreaHa:
      dto.totalAreaHa != null
        ? decimal(dto.totalAreaHa)
        : estate.totalAreaHa != null
          ? estate.totalAreaHa
          : null,
  };
}

async function getScoped(id, user) {
  const where = scopedWhere(user, { id });
  if (isVendorRole(user.role)) {
    where.vendorId = user.vendorId;
  }
  const row = await prisma.work_plan_submissions.findFirst({
    where,
    include: submissionInclude,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Work plan submission not found.");
  return row;
}

function assertVendorAdmin(user) {
  if (!isVendorRole(user.role) || user.role !== "vendor_admin") {
    throw new AppError(403, "FORBIDDEN", "Only vendor admin can manage work plan submissions.");
  }
  if (!user.vendorId) throw new AppError(400, "NO_VENDOR", "User is not linked to a vendor.");
}

function assertSpx(user) {
  if (!isSpxRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only SPX roles can review work plan submissions.");
  }
}

exports.findAll = async (query, user) => {
  requireProgramId(user);
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = scopedWhere(user);
  if (isVendorRole(user.role)) where.vendorId = user.vendorId;
  if (query.status) where.status = query.status;
  if (query.budgetYearGc) where.budgetYearGc = Number(query.budgetYearGc);
  const farmEstateId = farmEstateScope.parseFarmEstateId(query);
  if (farmEstateId) where.farmEstateId = farmEstateId;

  const [rows, total] = await Promise.all([
    prisma.work_plan_submissions.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: "desc" },
      include: submissionInclude,
    }),
    prisma.work_plan_submissions.count({ where }),
  ]);

  return { items: rows.map(submissionJson), meta: meta(page, pageSize, total) };
};

exports.findOne = async (id, user) => submissionJson(await getScoped(id, user));

exports.create = async (dto, user) => {
  assertVendorAdmin(user);
  const programId = requireProgramId(user);
  const fx = dto.fxEtbPerUsd || 130;
  const estateFields = await applyEstateToSubmission(dto, user, programId);
  const parsedJson =
    dto.parsedJson ||
    workPlanImport.buildEmptyParsed(fx, {
      farmName: estateFields.farmName,
      farmEstateId: estateFields.farmEstateId,
      totalAreaHa: estateFields.totalAreaHa != null ? Number(estateFields.totalAreaHa) : null,
    });

  const row = await prisma.work_plan_submissions.create({
    data: programCreateData(user, {
      id: uuid("wps"),
      vendorId: user.vendorId,
      farmEstateId: estateFields.farmEstateId,
      farmName: estateFields.farmName,
      totalAreaHa: estateFields.totalAreaHa,
      budgetYearLabel: dto.budgetYearLabel,
      budgetYearGc: dto.budgetYearGc,
      fxEtbPerUsd: decimal(fx),
      parsedJson,
      sourceAttachmentId: dto.sourceAttachmentId || null,
    }),
    include: submissionInclude,
  });
  return submissionJson(row);
};

exports.update = async (id, dto, user) => {
  assertVendorAdmin(user);
  const row = await getScoped(id, user);
  if (!["draft", "revision_requested"].includes(row.status)) {
    throw new AppError(400, "INVALID_STATE", "Only draft or revision-requested submissions can be edited.");
  }

  const data = {};
  if (dto.farmEstateId !== undefined) {
    const estateFields = await applyEstateToSubmission({ ...dto, farmEstateId: dto.farmEstateId }, user, row.programId);
    data.farmEstateId = estateFields.farmEstateId;
    data.farmName = estateFields.farmName;
    if (dto.totalAreaHa === undefined) data.totalAreaHa = estateFields.totalAreaHa;
  }
  if (dto.budgetYearLabel !== undefined) data.budgetYearLabel = dto.budgetYearLabel;
  if (dto.budgetYearGc !== undefined) data.budgetYearGc = dto.budgetYearGc;
  if (dto.fxEtbPerUsd !== undefined) data.fxEtbPerUsd = decimal(dto.fxEtbPerUsd);
  if (dto.totalAreaHa !== undefined) {
    data.totalAreaHa = dto.totalAreaHa === null ? null : decimal(dto.totalAreaHa);
  }

  const parsed = { ...(row.parsedJson || {}) };
  if (data.farmEstateId) {
    parsed.farmEstateId = data.farmEstateId;
    parsed.farmName = data.farmName;
  }
  if (dto.totalAreaHa !== undefined) parsed.totalAreaHa = dto.totalAreaHa;
  if (dto.fxEtbPerUsd !== undefined) parsed.fxEtbPerUsd = dto.fxEtbPerUsd;
  if (dto.budgetYearLabel !== undefined || dto.budgetYearGc !== undefined) {
    parsed.budgetYearLabel = dto.budgetYearLabel ?? row.budgetYearLabel;
    parsed.budgetYearGc = dto.budgetYearGc ?? row.budgetYearGc;
  }
  data.parsedJson = parsed;

  const updated = await prisma.work_plan_submissions.update({
    where: { id },
    data,
    include: submissionInclude,
  });
  return submissionJson(updated);
};

exports.updateParsed = async (id, parsedJson, user) => {
  assertVendorAdmin(user);
  const row = await getScoped(id, user);
  if (!["draft", "revision_requested"].includes(row.status)) {
    throw new AppError(400, "INVALID_STATE", "Only draft or revision-requested submissions can be edited.");
  }
  const validated = workPlanImport.parseJsonPayload(parsedJson, Number(row.fxEtbPerUsd));
  const updated = await prisma.work_plan_submissions.update({
    where: { id },
    data: { parsedJson: validated },
    include: submissionInclude,
  });
  return submissionJson(updated);
};

exports.uploadExcel = async (id, buffer, user) => {
  assertVendorAdmin(user);
  const row = await getScoped(id, user);
  if (!["draft", "revision_requested"].includes(row.status)) {
    throw new AppError(400, "INVALID_STATE", "Only draft submissions accept uploads.");
  }
  const parsed = workPlanImport.parseExcelBuffer(buffer, Number(row.fxEtbPerUsd));
  const updated = await prisma.work_plan_submissions.update({
    where: { id },
    data: { parsedJson: parsed },
    include: submissionInclude,
  });
  return submissionJson(updated);
};

exports.submit = async (id, user) => {
  assertVendorAdmin(user);
  const row = await getScoped(id, user);
  if (row.status === "submitted") return submissionJson(row);
  if (!["draft", "revision_requested"].includes(row.status)) {
    throw new AppError(400, "INVALID_STATE", "Submission cannot be submitted in current state.");
  }
  if (!row.farmEstateId && !row.farmName?.trim()) {
    throw new AppError(400, "INCOMPLETE", "Select a farm estate before submitting.");
  }
  const parsed = row.parsedJson || {};
  if (!parsed.categories?.length && !parsed.sections?.length) {
    throw new AppError(400, "INCOMPLETE", "Add plan activities before submitting.");
  }
  const updated = await prisma.work_plan_submissions.update({
    where: { id },
    data: {
      status: "submitted",
      submittedAt: new Date(),
      submittedByUserId: user.id,
      reviewNotes: null,
    },
    include: submissionInclude,
  });
  await notify.workPlanSubmitted(updated);
  return submissionJson(updated);
};

exports.requestRevision = async (id, notes, user) => {
  assertSpx(user);
  const row = await getScoped(id, user);
  if (row.status !== "submitted") {
    throw new AppError(400, "INVALID_STATE", "Only submitted plans can be sent back for revision.");
  }
  const updated = await prisma.work_plan_submissions.update({
    where: { id },
    data: {
      status: "revision_requested",
      reviewedAt: new Date(),
      reviewedByUserId: user.id,
      reviewNotes: notes || "Revision requested.",
    },
    include: submissionInclude,
  });
  await notify.workPlanRevisionRequested(updated);
  return submissionJson(updated);
};

exports.reject = async (id, notes, user) => {
  assertSpx(user);
  const row = await getScoped(id, user);
  if (!["submitted", "revision_requested"].includes(row.status)) {
    throw new AppError(400, "INVALID_STATE", "Submission cannot be rejected in current state.");
  }
  const updated = await prisma.work_plan_submissions.update({
    where: { id },
    data: {
      status: "rejected",
      reviewedAt: new Date(),
      reviewedByUserId: user.id,
      reviewNotes: notes || "Rejected.",
    },
    include: submissionInclude,
  });
  await notify.workPlanRejected(updated);
  return submissionJson(updated);
};

exports.accept = async (id, user, body = {}) => {
  assertSpx(user);
  const row = await getScoped(id, user);
  if (row.status !== "submitted") {
    throw new AppError(400, "INVALID_STATE", "Only submitted plans can be accepted.");
  }

  let parsed = row.parsedJson;
  if (body.parsedJson) {
    parsed = workPlanImport.parseJsonPayload(body.parsedJson, Number(row.fxEtbPerUsd));
    await prisma.work_plan_submissions.update({
      where: { id },
      data: { parsedJson: parsed },
    });
  }

  const promoteResult = await workPlanPromote.promoteSubmission(
    { ...row, parsedJson: parsed },
    { createdByUserId: user.id, year: body.year || row.budgetYearGc },
  );

  const updated = await prisma.work_plan_submissions.update({
    where: { id },
    data: {
      status: "accepted",
      reviewedAt: new Date(),
      reviewedByUserId: user.id,
      reviewNotes: body.notes || "Accepted and promoted to AFP catalog.",
      promotedAt: new Date(),
    },
    include: submissionInclude,
  });
  await notify.workPlanAccepted(updated);

  return { submission: submissionJson(updated), promote: promoteResult };
};

exports.getAfpSchedule = workPlanPromote.getAfpLineSchedule;
