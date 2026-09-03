const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");
const { assertHectareContract } = require("../lib/hectareContract");
const { decimal, parseListQuery, meta } = require("../utils/helpers");
const { isVendorRole, isSpxRole, isSilvaRole } = require("../utils/roles");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");

function estateJson(row) {
  return {
    id: row.id,
    programId: row.programId,
    name: row.name,
    totalAreaHa: row.totalAreaHa != null ? Number(row.totalAreaHa) : null,
    location: row.location,
    notes: row.notes,
    status: row.status,
    termStartDate: row.termStartDate?.toISOString().slice(0, 10) || null,
    approverUserId: row.approverUserId ?? null,
    fieldManagerUserId: row.fieldManagerUserId ?? null,
    coreBundleElected: row.coreBundleElected ?? null,
    ownerOrganizationId: row.ownerOrganizationId ?? null,
    ownerOrganization: row.ownerOrganization
      ? {
          id: row.ownerOrganization.id,
          name: row.ownerOrganization.displayName || row.ownerOrganization.name,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    vendors: (row.vendorMaps || []).map((m) => ({
      id: m.vendor.id,
      name: m.vendor.name,
      isPrimary: m.isPrimary,
    })),
    blocks: (row.blocks || []).map((b) => ({
      id: b.id,
      code: b.code,
      label: b.label,
      areaHa: b.areaHa != null ? Number(b.areaHa) : null,
      treeCount: b.treeCount,
      varietyPlanted: b.varietyPlanted ?? null,
      plantingDate: b.plantingDate?.toISOString().slice(0, 10) || null,
      status: b.status || "active",
    })),
  };
}

function blockJson(block) {
  return {
    id: block.id,
    code: block.code,
    label: block.label,
    areaHa: block.areaHa != null ? Number(block.areaHa) : null,
    treeCount: block.treeCount,
    varietyPlanted: block.varietyPlanted ?? null,
    plantingDate: block.plantingDate?.toISOString().slice(0, 10) || null,
    status: block.status || "active",
  };
}

function assertSpxManage(user) {
  if (!isSpxRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only SPX roles can manage farm estates.");
  }
}

async function assertApproverUser(programId, ownerOrganizationId, approverUserId) {
  if (!approverUserId) return;
  const user = await prisma.users.findUnique({ where: { id: approverUserId } });
  if (!user) throw new AppError(400, "VALIDATION_ERROR", "Approver user not found.");
  if (ownerOrganizationId && user.organizationId !== ownerOrganizationId) {
    throw new AppError(400, "VALIDATION_ERROR", "Approver must belong to the owning organization.");
  }
}

async function assertOwnerOrganization(programId, ownerOrganizationId) {
  if (!ownerOrganizationId) return;
  const org = await prisma.organizations.findUnique({ where: { id: ownerOrganizationId } });
  if (!org || org.type !== "silva") {
    throw new AppError(400, "VALIDATION_ERROR", "Asset owner must be an asset-owner organization.");
  }
  const membership = await prisma.program_memberships.findUnique({
    where: { programId_organizationId: { programId, organizationId: ownerOrganizationId } },
  });
  if (!membership) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Asset owner organization must be a member of this program.",
    );
  }
}

const estateInclude = {
  ownerOrganization: true,
  vendorMaps: { include: { vendor: true } },
  blocks: { orderBy: { code: "asc" } },
};

async function getEstateScoped(id, user, { includeDetails = true } = {}) {
  requireProgramId(user);
  const where = scopedWhere(user, { id });
  if (isVendorRole(user.role)) {
    where.vendorMaps = { some: { vendorId: user.vendorId } };
    where.status = "active";
  } else if (isSilvaRole(user.role)) {
    where.ownerOrganizationId = user.organizationId;
    where.status = "active";
  }
  const row = await prisma.farm_estates.findFirst({
    where,
      include: includeDetails
      ? estateInclude
      : undefined,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Farm estate not found.");
  return row;
}

exports.findAll = async (query, user) => {
  requireProgramId(user);
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = scopedWhere(user);
  if (isVendorRole(user.role)) {
    where.vendorMaps = { some: { vendorId: user.vendorId } };
    where.status = "active";
  } else if (isSilvaRole(user.role)) {
    where.ownerOrganizationId = user.organizationId;
    where.status = "active";
  } else if (query.forVendorId) {
    where.vendorMaps = { some: { vendorId: query.forVendorId } };
  }
  if (query.status) where.status = query.status;

  const [rows, total] = await Promise.all([
    prisma.farm_estates.findMany({
      where,
      skip,
      take,
      orderBy: { name: "asc" },
      include: estateInclude,
    }),
    prisma.farm_estates.count({ where }),
  ]);

  return { items: rows.map(estateJson), meta: meta(page, pageSize, total) };
};

exports.findOne = async (id, user) => estateJson(await getEstateScoped(id, user));

exports.create = async (dto, user) => {
  assertSpxManage(user);
  const programId = requireProgramId(user);
  if (dto.ownerOrganizationId) {
    await assertOwnerOrganization(programId, dto.ownerOrganizationId);
  }
  if (dto.approverUserId) {
    await assertApproverUser(programId, dto.ownerOrganizationId, dto.approverUserId);
  }
  const row = await prisma.farm_estates.create({
    data: programCreateData(user, {
      id: uuid("fest"),
      name: dto.name.trim(),
      ownerOrganizationId: dto.ownerOrganizationId || null,
      approverUserId: dto.approverUserId || null,
      fieldManagerUserId: dto.fieldManagerUserId || null,
      termStartDate: dto.termStartDate ? new Date(dto.termStartDate) : null,
      totalAreaHa: dto.totalAreaHa != null ? decimal(dto.totalAreaHa) : null,
      location: dto.location?.trim() || null,
      notes: dto.notes?.trim() || null,
      status: dto.status || "active",
      vendorMaps: dto.vendorIds?.length
        ? {
            create: dto.vendorIds.map((vendorId, i) => ({
              id: uuid("fev"),
              vendorId,
              isPrimary: i === 0,
            })),
          }
        : undefined,
      blocks: dto.blocks?.length
        ? {
            create: dto.blocks.map((b) => ({
              id: uuid("blk"),
              programId,
              code: b.code.trim().toUpperCase(),
              label: b.label?.trim() || `Block ${b.code.trim().toUpperCase()}`,
      areaHa: b.areaHa != null ? decimal(b.areaHa) : null,
      treeCount: b.treeCount ?? null,
      varietyPlanted: b.varietyPlanted?.trim() || null,
      plantingDate: b.plantingDate ? new Date(b.plantingDate) : null,
      status: b.status || "active",
            })),
          }
        : undefined,
    }),
    include: estateInclude,
  });
  return estateJson(row);
};

exports.update = async (id, dto, user) => {
  assertSpxManage(user);
  const programId = requireProgramId(user);
  await getEstateScoped(id, user, { includeDetails: false });
  if (dto.ownerOrganizationId !== undefined) {
    if (dto.ownerOrganizationId) {
      await assertOwnerOrganization(programId, dto.ownerOrganizationId);
    }
  }
  if (dto.approverUserId !== undefined) {
    const estate = await prisma.farm_estates.findUnique({ where: { id } });
    await assertApproverUser(
      programId,
      dto.ownerOrganizationId !== undefined ? dto.ownerOrganizationId : estate?.ownerOrganizationId,
      dto.approverUserId,
    );
  }
  const row = await prisma.farm_estates.update({
    where: { id },
    data: {
      name: dto.name?.trim(),
      termStartDate:
        dto.termStartDate !== undefined
          ? dto.termStartDate
            ? new Date(dto.termStartDate)
            : null
          : undefined,
      approverUserId: dto.approverUserId !== undefined ? dto.approverUserId : undefined,
      fieldManagerUserId:
        dto.fieldManagerUserId !== undefined ? dto.fieldManagerUserId : undefined,
      coreBundleElected:
        dto.coreBundleElected !== undefined ? dto.coreBundleElected : undefined,
      ownerOrganizationId:
        dto.ownerOrganizationId !== undefined ? dto.ownerOrganizationId : undefined,
      totalAreaHa:
        dto.totalAreaHa !== undefined
          ? dto.totalAreaHa === null
            ? null
            : decimal(dto.totalAreaHa)
          : undefined,
      location: dto.location !== undefined ? dto.location?.trim() || null : undefined,
      notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
      status: dto.status,
    },
    include: estateInclude,
  });
  return estateJson(row);
};

exports.setVendors = async (id, vendorIds, user) => {
  assertSpxManage(user);
  await getEstateScoped(id, user, { includeDetails: false });
  await prisma.farm_estate_vendors.deleteMany({ where: { farmEstateId: id } });
  if (vendorIds?.length) {
    await prisma.farm_estate_vendors.createMany({
      data: vendorIds.map((vendorId, i) => ({
        id: uuid("fev"),
        farmEstateId: id,
        vendorId,
        isPrimary: i === 0,
      })),
    });
  }
  return exports.findOne(id, user);
};

exports.addBlock = async (estateId, dto, user) => {
  assertSpxManage(user);
  const estate = await getEstateScoped(estateId, user, { includeDetails: false });
  const code = dto.code.trim().toUpperCase();
  const block = await prisma.farm_blocks.create({
    data: {
      id: uuid("blk"),
      programId: estate.programId,
      farmEstateId: estateId,
      code,
      label: dto.label?.trim() || `Block ${code}`,
      areaHa: dto.areaHa != null ? decimal(dto.areaHa) : null,
      treeCount: dto.treeCount ?? null,
      varietyPlanted: dto.varietyPlanted?.trim() || null,
      plantingDate: dto.plantingDate ? new Date(dto.plantingDate) : null,
      status: dto.status || "active",
    },
  });
  await assertHectareContract(estate.programId);
  return blockJson(block);
};

exports.updateBlock = async (estateId, blockId, dto, user) => {
  assertSpxManage(user);
  const estate = await getEstateScoped(estateId, user, { includeDetails: false });
  const existing = await prisma.farm_blocks.findFirst({
    where: { id: blockId, farmEstateId: estateId },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Block not found on this estate.");

  const block = await prisma.farm_blocks.update({
    where: { id: blockId },
    data: {
      code: dto.code !== undefined ? dto.code.trim().toUpperCase() : undefined,
      label: dto.label !== undefined ? dto.label?.trim() || existing.label : undefined,
      areaHa:
        dto.areaHa !== undefined ? (dto.areaHa === null ? null : decimal(dto.areaHa)) : undefined,
      treeCount: dto.treeCount !== undefined ? dto.treeCount : undefined,
      varietyPlanted:
        dto.varietyPlanted !== undefined ? dto.varietyPlanted?.trim() || null : undefined,
      plantingDate:
        dto.plantingDate !== undefined
          ? dto.plantingDate
            ? new Date(dto.plantingDate)
            : null
          : undefined,
      status: dto.status !== undefined ? dto.status : undefined,
    },
  });
  await assertHectareContract(estate.programId);
  return blockJson(block);
};

exports.removeBlock = async (estateId, blockId, user) => {
  assertSpxManage(user);
  await getEstateScoped(estateId, user, { includeDetails: false });
  const block = await prisma.farm_blocks.findFirst({ where: { id: blockId, farmEstateId: estateId } });
  if (!block) throw new AppError(404, "NOT_FOUND", "Block not found on this estate.");

  const [assignments, afpLines, fieldTickets, elections, activityPlans] = await Promise.all([
    prisma.work_order_block_assignments.count({ where: { blockId } }),
    prisma.afp_block_lines.count({ where: { blockId } }),
    prisma.block_field_tickets.count({ where: { blockId } }),
    prisma.cropfort_elections.count({ where: { blockId } }),
    prisma.cropfort_activity_plans.count({ where: { blockId } }),
  ]);

  const blockers = [
    ["work order assignments", assignments],
    ["annual farm plan lines", afpLines],
    ["field tickets", fieldTickets],
    ["elections", elections],
    ["activity plans", activityPlans],
  ].filter(([, count]) => count > 0);

  if (blockers.length) {
    throw new AppError(
      409,
      "BLOCK_IN_USE",
      `Block ${block.code} still has ${blockers
        .map(([label, count]) => `${count} ${label}`)
        .join(", ")}. Retire it instead of deleting.`,
    );
  }

  // No hectare-contract re-check here: removing a block can only reduce total
  // area, and asserting after the delete would report a pre-existing overage
  // as though the delete had failed.
  await prisma.farm_blocks.delete({ where: { id: blockId } });
  return { ok: true, code: block.code };
};

exports.assertVendorEstateAccess = async (farmEstateId, vendorId, programId) => {
  const row = await prisma.farm_estates.findFirst({
    where: {
      id: farmEstateId,
      programId,
      status: "active",
      vendorMaps: { some: { vendorId } },
    },
    include: { blocks: { orderBy: { code: "asc" } } },
  });
  if (!row) {
    throw new AppError(403, "FORBIDDEN", "Vendor is not assigned to this farm estate.");
  }
  return row;
};
