const { asciiSafe } = require("./reportExportFormat");

const PAGE = { width: 612, height: 792, margin: 50, bottom: 56 };

function escapePdfText(text) {
  return asciiSafe(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Build a multi-page PDF using Helvetica + Helvetica-Bold + Courier (Type1, ASCII-safe).
 * @param {Array<{kind: string, text?: string, label?: string, value?: string, cols?: string[]}>} blocks
 */
function structuredPdf(blocks) {
  const pages = [[]];
  let y = PAGE.height - PAGE.margin;

  function currentOps() {
    return pages[pages.length - 1];
  }

  function newPage() {
    pages.push([]);
    y = PAGE.height - PAGE.margin;
  }

  function ensureSpace(height) {
    if (y - height < PAGE.bottom) newPage();
  }

  function drawLine(yPos) {
    currentOps().push(`${PAGE.margin} ${yPos} m ${PAGE.width - PAGE.margin} ${yPos} l S`);
  }

  function drawText(text, { x, y: yPos, size, font }) {
    const safe = escapePdfText(text);
    if (!safe) return;
    const ops = currentOps();
    ops.push("BT");
    ops.push(`/${font} ${size} Tf`);
    ops.push(`${x} ${yPos} Td`);
    ops.push(`(${safe}) Tj`);
    ops.push("ET");
  }

  for (const block of blocks) {
    switch (block.kind) {
      case "title": {
        ensureSpace(28);
        drawText(block.text, { x: PAGE.margin, y: y, size: 16, font: "F2" });
        y -= 22;
        break;
      }
      case "subtitle": {
        ensureSpace(20);
        drawText(block.text, { x: PAGE.margin, y: y, size: 11, font: "F1" });
        y -= 18;
        break;
      }
      case "section": {
        ensureSpace(24);
        y -= 6;
        drawLine(y + 10);
        drawText(block.text, { x: PAGE.margin, y: y - 2, size: 10, font: "F2" });
        y -= 20;
        break;
      }
      case "kv": {
        ensureSpace(14);
        drawText(block.label, { x: PAGE.margin, y: y, size: 10, font: "F1" });
        drawText(block.value, { x: PAGE.margin + 140, y: y, size: 10, font: "F3" });
        y -= 14;
        break;
      }
      case "table-header": {
        ensureSpace(16);
        drawText(block.cols.join("  "), { x: PAGE.margin, y: y, size: 9, font: "F2" });
        y -= 12;
        drawLine(y + 4);
        y -= 6;
        break;
      }
      case "table-row": {
        ensureSpace(13);
        drawText(block.cols.join("  "), { x: PAGE.margin, y: y, size: 9, font: "F3" });
        y -= 13;
        break;
      }
      case "body": {
        ensureSpace(14);
        drawText(block.text, { x: PAGE.margin, y: y, size: 10, font: "F1" });
        y -= 14;
        break;
      }
      case "muted": {
        ensureSpace(12);
        drawText(block.text, { x: PAGE.margin, y: y, size: 9, font: "F1" });
        y -= 12;
        break;
      }
      case "gap":
        y -= 10;
        break;
      default:
        break;
    }
  }

  const streams = pages.map((ops) => ["0.75 w", "0 0 0 RG", "0 0 0 rg", ...ops].join("\n"));
  return encodePdf(streams);
}

function encodePdf(streams) {
  const objects = [];
  let nextId = 1;

  function pushObject(body) {
    const id = nextId;
    objects.push(body);
    nextId += 1;
    return id;
  }

  const fontRegular = pushObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBold = pushObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const fontMono = pushObject("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");

  const contentIds = streams.map((stream) =>
    pushObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`),
  );

  const pagesId = 3 + contentIds.length * 2 + 1;
  const pageIds = contentIds.map(
    (contentId) =>
      pushObject(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
          `/Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R /F3 ${fontMono} 0 R >> >> >>`,
      ),
  );

  pushObject(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);

  const catalogId = pushObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefPos = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

module.exports = { structuredPdf, escapePdfText };
