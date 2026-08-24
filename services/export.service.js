const fs = require("fs");
const path = require("path");
const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const platformService = require("./platform.service");

const EXPORT_DIR = path.join(process.cwd(), "exports");

function ensureExportDir(sub) {
  const dir = path.join(EXPORT_DIR, sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Minimal PDF bytes for a single-page text report (no external deps). */
function simplePdf(lines) {
  const text = lines.join("\n").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = `BT /F1 11 Tf 50 750 Td (${text.substring(0, 2000)}) Tj ET`;
  const objs = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj",
    `4 0 obj<< /Length ${content.length} >>stream\n${content}\nendstream endobj`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objs.forEach((o) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += o + "\n";
  });
  const xrefPos = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

exports.generateAfpPdf = async (afpLineId, user) => {
  const line = await prisma.afp_lines.findUnique({ where: { id: afpLineId } });
  if (!line) throw new AppError(404, "NOT_FOUND", "AFP line not found.");
  const lines = [
    "Coffee Field OS — Budget Line Export",
    `Line: ${line.id}`,
    `Year: ${line.year}`,
    `Discipline: ${line.operatingDiscipline}`,
    `Activity: ${line.activity}`,
    `Budget USD: ${line.budgetAllocatedUsd}`,
    `KPI: ${line.kpiTarget}`,
    `Status: ${line.status}`,
    line.notes ? `Notes: ${line.notes}` : "",
  ].filter(Boolean);
  const buf = simplePdf(lines);
  const file = path.join(ensureExportDir("pdf"), `${line.id}.pdf`);
  fs.writeFileSync(file, buf);
  return { fileName: `${line.id}.pdf`, buffer: buf, contentType: "application/pdf" };
};

exports.generateBoardPackPdf = async ({ period, type }, user) => {
  const { items: bva } = await platformService.budgetVsActual(
    { year: new Date().getFullYear(), pageSize: 12 },
    user,
  );
  const lines = [
    `Coffee Field OS — ${type || "Monthly"} Board Pack`,
    `Period: ${period || "current"}`,
    `Program: ${user.activeProgramId}`,
    "",
    "Budget vs Actual summary:",
    ...bva.slice(0, 12).map(
      (r) => `${r.activity}: budget ${r.budgetAllocatedUsd} committed ${r.committedUsd} actual ${r.actualUsd}`,
    ),
  ];
  const buf = simplePdf(lines);
  const fileName = `board-pack-${period || "current"}.pdf`;
  const file = path.join(ensureExportDir("pdf"), fileName);
  fs.writeFileSync(file, buf);
  return { fileName, buffer: buf, contentType: "application/pdf" };
};

exports.generateReportPdf = async (reportId, user) => {
  const report = await platformService.findReport(reportId, user);
  const bvaSection = report.sections?.find((s) => s.key === "budget_vs_actual");
  const items = Array.isArray(bvaSection?.payload) ? bvaSection.payload : [];
  const lines = [
    "Coffee Field OS — Period Report",
    `Type: ${report.type}`,
    `Period: ${report.period}`,
    `Status: ${report.status}`,
    report.generatedAt ? `Generated: ${report.generatedAt}` : "",
    report.releasedAt ? `Released: ${report.releasedAt}` : "",
    "",
    report.narrative ? `SPX narrative: ${report.narrative}` : "SPX narrative: (none)",
    "",
    "Budget vs actual:",
    ...items.map(
      (r) =>
        `${r.activity}: budget $${r.budgetAllocatedUsd ?? "—"} committed $${r.committedUsd ?? "—"} actual $${r.actualUsd ?? "—"} ${r.utilizationPercent ?? 0}%`,
    ),
  ].filter(Boolean);
  const buf = simplePdf(lines);
  const fileName = `report-${report.type}-${report.period}.pdf`.replace(/[^\w.-]+/g, "-");
  return { fileName, buffer: buf, contentType: "application/pdf" };
};

/** Silva GL file-drop export (CSV) for external accounting ingestion. */
exports.silvaGlDrop = async ({ period }, user) => {
  if (!["spx_principal", "system_admin"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "SPX principal only.");
  }
  const exp = await platformService.generateGlExport({ period }, user);
  const full = await prisma.gl_journal_exports.findUnique({
    where: { id: exp.id },
    include: { lines: true },
  });
  const rows = full?.lines ?? [];
  const csv = [
    "period,gl_account,debit_etb,credit_etb,memo",
    ...rows.map(
      (l) =>
        `${exp.period},${l.account},${Number(l.debitEtb)},${Number(l.creditEtb)},"${(l.memo || "").replace(/"/g, '""')}"`,
    ),
  ].join("\n");
  const dir = ensureExportDir(path.join("silva-gl-drop", user.activeProgramId || "global"));
  const fileName = `silva-gl-${period}.csv`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, csv, "utf8");
  return { fileName, filePath, csv, exportId: exp.id };
};
