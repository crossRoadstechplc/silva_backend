const PERIOD_REPORT_LABELS = {
  weekly: "Weekly Progress",
  monthly: "Monthly Cost and Progress",
  quarterly: "Quarterly Governance Pack",
  annual: "Annual Performance Report",
};

/** Strip/replace characters that Type1 PDF fonts cannot render. */
function asciiSafe(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[\u2010-\u2015\u2212\u00ad]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatReportPeriod(period, type) {
  if (type === "weekly" && String(period).includes("-W")) {
    return asciiSafe(String(period).replace("-", " Week "));
  }
  if (/^\d{4}-\d{2}$/.test(String(period))) {
    const [year, month] = String(period).split("-");
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  return asciiSafe(period);
}

function formatEtbPlain(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatHealth(health) {
  return asciiSafe(String(health || "on_track").replace(/_/g, " "));
}

function formatIsoDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return asciiSafe(String(iso).slice(0, 10));
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function pad(text, width, align = "left") {
  const safe = asciiSafe(text);
  if (safe.length >= width) return safe.slice(0, width);
  const padLen = width - safe.length;
  return align === "right" ? " ".repeat(padLen) + safe : safe + " ".repeat(padLen);
}

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildReportCsv(report, items, summary) {
  const typeLabel = PERIOD_REPORT_LABELS[report.type] || report.type;
  const periodLabel = formatReportPeriod(report.period, report.type);
  const lines = [];

  lines.push("Cropfort Period Report");
  lines.push(`Report type,${csvEscape(typeLabel)}`);
  lines.push(`Period,${csvEscape(periodLabel)} (${report.period})`);
  lines.push(`Exported,${new Date().toISOString().slice(0, 10)}`);
  lines.push("");

  lines.push("Report metadata");
  lines.push("Field,Value");
  lines.push(`Report ID,${csvEscape(report.id)}`);
  lines.push(`Type,${csvEscape(report.type)}`);
  lines.push(`Period code,${csvEscape(report.period)}`);
  lines.push(`Period label,${csvEscape(periodLabel)}`);
  lines.push(`Status,${csvEscape(report.status)}`);
  lines.push(`Generated,${csvEscape(formatIsoDate(report.generatedAt))}`);
  lines.push(`Released,${csvEscape(formatIsoDate(report.releasedAt))}`);
  lines.push(`Visible to Silva,${report.visibleToSilva ? "Yes" : "No"}`);
  lines.push("");

  lines.push("Summary (ETB)");
  lines.push("Metric,Amount (ETB),Utilization %");
  if (summary) {
    lines.push(`Budget,${summary.budget},`);
    lines.push(`Committed,${summary.committed},`);
    lines.push(`Actual,${summary.actual},${summary.utilization}`);
    lines.push(`AFP lines,${summary.lineCount},`);
  } else {
    lines.push("No budget vs actual lines captured,,");
  }
  lines.push("");

  lines.push("Budget vs actual");
  lines.push("Activity,AFP line ID,Budget (ETB),Committed (ETB),Actual (ETB),Utilization %,Health");
  for (const row of items) {
    lines.push(
      [
        csvEscape(asciiSafe(row.activity)),
        csvEscape(row.afpLineId),
        row.budgetAllocatedEtb ?? 0,
        row.committedEtb ?? 0,
        row.actualEtb ?? 0,
        row.utilizationPercent ?? 0,
        csvEscape(formatHealth(row.health)),
      ].join(","),
    );
  }
  lines.push("");

  lines.push("SPX narrative");
  lines.push("Content");
  lines.push(csvEscape(report.narrative ? asciiSafe(report.narrative) : "(none)"));

  return `${lines.join("\n")}\n`;
}

function buildReportPdfLines(report, items, summary) {
  const typeLabel = PERIOD_REPORT_LABELS[report.type] || report.type;
  const periodLabel = formatReportPeriod(report.period, report.type);
  const lines = [];

  lines.push({ kind: "title", text: "CROPFORT PERIOD REPORT" });
  lines.push({ kind: "subtitle", text: `${typeLabel} - ${periodLabel}` });
  lines.push({ kind: "gap" });

  lines.push({ kind: "section", text: "REPORT INFORMATION" });
  lines.push({ kind: "kv", label: "Report ID", value: report.id });
  lines.push({ kind: "kv", label: "Type", value: report.type });
  lines.push({ kind: "kv", label: "Period", value: `${periodLabel} (${report.period})` });
  lines.push({ kind: "kv", label: "Status", value: report.status });
  lines.push({ kind: "kv", label: "Generated", value: formatIsoDate(report.generatedAt) });
  if (report.releasedAt) {
    lines.push({ kind: "kv", label: "Released", value: formatIsoDate(report.releasedAt) });
  }
  lines.push({ kind: "kv", label: "Visible to Silva", value: report.visibleToSilva ? "Yes" : "No" });
  lines.push({ kind: "gap" });

  lines.push({ kind: "section", text: "SUMMARY (ETB)" });
  if (summary) {
    lines.push({
      kind: "table-header",
      cols: [pad("Metric", 14), pad("Budget", 12, "right"), pad("Committed", 12, "right"), pad("Actual", 12, "right"), pad("Util", 6, "right")],
    });
    lines.push({
      kind: "table-row",
      cols: [
        pad("Farm total", 14),
        pad(formatEtbPlain(summary.budget), 12, "right"),
        pad(formatEtbPlain(summary.committed), 12, "right"),
        pad(formatEtbPlain(summary.actual), 12, "right"),
        pad(`${summary.utilization}%`, 6, "right"),
      ],
    });
    lines.push({ kind: "muted", text: `AFP lines: ${summary.lineCount}` });
  } else {
    lines.push({ kind: "body", text: "No budget vs actual lines captured." });
  }
  lines.push({ kind: "gap" });

  lines.push({ kind: "section", text: "BUDGET VS ACTUAL" });
  lines.push({
    kind: "table-header",
    cols: [
      pad("Activity", 34),
      pad("Budget", 10, "right"),
      pad("Committed", 10, "right"),
      pad("Actual", 10, "right"),
      pad("Util", 5, "right"),
      pad("Health", 12),
    ],
  });
  for (const row of items) {
    lines.push({
      kind: "table-row",
      cols: [
        pad(asciiSafe(row.activity), 34),
        pad(formatEtbPlain(row.budgetAllocatedEtb), 10, "right"),
        pad(formatEtbPlain(row.committedEtb), 10, "right"),
        pad(formatEtbPlain(row.actualEtb), 10, "right"),
        pad(`${row.utilizationPercent ?? 0}%`, 5, "right"),
        pad(formatHealth(row.health), 12),
      ],
    });
  }
  lines.push({ kind: "gap" });

  lines.push({ kind: "section", text: "SPX NARRATIVE" });
  const narrative = report.narrative ? asciiSafe(report.narrative) : "(none)";
  for (const chunk of wrapText(narrative, 90)) {
    lines.push({ kind: "body", text: chunk });
  }

  return lines;
}

function wrapText(text, maxLen) {
  const words = asciiSafe(text).split(" ");
  const out = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLen) {
      if (line) out.push(line);
      line = word.length > maxLen ? word.slice(0, maxLen) : word;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

module.exports = {
  PERIOD_REPORT_LABELS,
  asciiSafe,
  formatReportPeriod,
  formatEtbPlain,
  buildReportCsv,
  buildReportPdfLines,
};
