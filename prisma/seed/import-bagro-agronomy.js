const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "bagro", "agronomy.json");

function dec(v) {
  if (v === null || v === undefined) return null;
  return v;
}

/**
 * Import B-Agro Chetu Farm agronomy sections I–IV into AFP lines, activity catalog, and AFEs.
 * @returns {{ afpLines: Record<string, object>, afes: Record<string, object> }}
 */
async function importBagroAgronomy(prisma, { programId, createdByUserId, handlerUserId, year = 2026 }) {
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  const plan = JSON.parse(raw);

  const afpLines = {};
  const afes = {};

  for (const section of plan.sections) {
    const afp = await prisma.afp_lines.create({
      data: {
        id: section.afpLineId,
        programId,
        year,
        operatingDiscipline: "Agronomic Operations",
        activity: section.afp.activity,
        budgetAllocatedUsd: section.afp.budgetUsd,
        kpiTarget: section.afp.kpiTarget,
        status: "approved",
        silvaApproved: true,
        approvalDate: new Date(`${year}-01-15T00:00:00.000Z`),
        notes: section.afp.notes,
        createdByUserId,
      },
    });
    afpLines[section.sectionCode] = afp;

    const afeId = `AFE-${section.afpLineId.replace("AFP-", "")}`;
    const afe = await prisma.afes.create({
      data: {
        id: afeId,
        programId,
        afpLineId: afp.id,
        operatingDiscipline: "Agronomic Operations",
        description: `${section.sectionLabel} — Chetu Farm ${year}`,
        estimatedCostUsd: section.afp.budgetUsd,
        band: "A",
        spxValidated: true,
        silvaApprovalRequired: false,
        silvaApproved: false,
        approvalDate: new Date(`${year}-02-01T00:00:00.000Z`),
        status: "approved",
        createdByUserId: handlerUserId,
      },
    });
    afes[section.sectionCode] = afe;

    let sortOrder = 0;
    for (const act of section.activities) {
      sortOrder += 1;
      await prisma.activity_catalog.create({
        data: {
          id: act.id,
          programId,
          afpLineId: afp.id,
          sectionCode: section.sectionCode,
          sectionLabel: section.sectionLabel,
          sortOrder,
          nameEn: act.nameEn,
          nameAm: act.nameAm || null,
          unit: act.unit,
          normMdPerUnit: dec(act.normMdPerUnit),
          normCostEtb: act.annualCostEtb && act.annualQuantity
            ? dec(act.annualCostEtb / act.annualQuantity)
            : dec(act.normCostEtb),
          normWageEtb: dec(act.normWageEtb),
          normsPerMd: dec(act.normsPerMd),
          annualQuantity: dec(act.annualQuantity),
          annualMandays: dec(act.annualMandays),
          annualCostEtb: dec(act.annualCostEtb),
          scopeJson: section.scope,
        },
      });

      if (act.schedule?.length) {
        for (const row of act.schedule) {
          await prisma.activity_schedule.create({
            data: {
              id: `sch_${act.id}_${year}_${row.month}`,
              activityCatalogId: act.id,
              programId,
              year,
              month: row.month,
              plannedQuantity: dec(row.quantity),
              plannedMandays: dec(row.mandays),
              plannedCostEtb: dec(row.costEtb),
            },
          });
        }
      }
    }
  }

  return { afpLines, afes, fxEtbPerUsd: plan.fxEtbPerUsd };
}

module.exports = { importBagroAgronomy };
