const prisma = require("../../config/database");

function parseFarmEstateId(query) {
  const id = query?.farmEstateId;
  if (!id || typeof id !== "string") return null;
  const trimmed = id.trim();
  return trimmed || null;
}

async function assertEstateInProgram(farmEstateId, programId) {
  return prisma.farm_estates.findFirst({
    where: { id: farmEstateId, programId, status: "active" },
  });
}

async function vendorIdsForEstate(farmEstateId, programId) {
  const maps = await prisma.farm_estate_vendors.findMany({
    where: { farmEstateId, farmEstate: { programId } },
    select: { vendorId: true },
  });
  return maps.map((m) => m.vendorId);
}

async function blockIdsForEstate(farmEstateId, programId) {
  const blocks = await prisma.farm_blocks.findMany({
    where: { farmEstateId, programId },
    select: { id: true },
  });
  return blocks.map((b) => b.id);
}

/** Prisma `where` fragment for work_orders scoped to a farm estate. */
async function workOrderWhereForEstate(farmEstateId, programId) {
  const estate = await assertEstateInProgram(farmEstateId, programId);
  if (!estate) return { id: "__no_estate__" };

  const [vendorIds, blockIds] = await Promise.all([
    vendorIdsForEstate(farmEstateId, programId),
    blockIdsForEstate(farmEstateId, programId),
  ]);

  const or = [];
  if (vendorIds.length) or.push({ assignedVendorId: { in: vendorIds } });
  if (blockIds.length) or.push({ blockAssignments: { some: { blockId: { in: blockIds } } } });
  if (!or.length) return { id: "__no_estate__" };
  return { OR: or };
}

/** Merge work-order estate filter into an existing workOrder relation filter. */
async function mergeWorkOrderEstateFilter(existingWorkOrderFilter, farmEstateId, programId) {
  const estateFilter = await workOrderWhereForEstate(farmEstateId, programId);
  if (!existingWorkOrderFilter || Object.keys(existingWorkOrderFilter).length === 0) {
    return estateFilter;
  }
  return { AND: [existingWorkOrderFilter, estateFilter] };
}

/** Merge estate filter without clobbering an existing top-level OR (e.g. vendor scope). */
function mergeEstateFilter(where, estateFilter) {
  if (!estateFilter || !Object.keys(estateFilter).length) return where;
  if (where.OR) {
    where.AND = [{ OR: where.OR }, estateFilter];
    delete where.OR;
    return where;
  }
  return Object.assign(where, estateFilter);
}

module.exports = {
  parseFarmEstateId,
  assertEstateInProgram,
  vendorIdsForEstate,
  blockIdsForEstate,
  workOrderWhereForEstate,
  mergeWorkOrderEstateFilter,
  mergeEstateFilter,
};
