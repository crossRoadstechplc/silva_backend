const express = require("express");
const exportService = require("../services/export.service");
const catchAsync = require("../utils/catchAsync");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

router.get(
  "/afp/:afpLineId/pdf",
  catchAsync(async (req, res) => {
    const out = await exportService.generateAfpPdf(req.params.afpLineId, req.user);
    res.setHeader("Content-Type", out.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${out.fileName}"`);
    res.send(out.buffer);
  }),
);

const SPX = ["spx_principal", "spx_account_handler", "spx_field_supervisor", "system_admin"];
const SILVA_REPORT = ["silva_owner", "silva_finance", "silva_country_manager"];

router.post(
  "/board-pack/pdf",
  requireRole([...SPX, ...SILVA_REPORT]),
  catchAsync(async (req, res) => {
    const out = await exportService.generateBoardPackPdf(req.body, req.user);
    res.setHeader("Content-Type", out.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${out.fileName}"`);
    res.send(out.buffer);
  }),
);

router.get(
  "/reports/:reportId/pdf",
  requireRole([...SPX, ...SILVA_REPORT]),
  catchAsync(async (req, res) => {
    const out = await exportService.generateReportPdf(req.params.reportId, req.user);
    res.setHeader("Content-Type", out.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${out.fileName}"`);
    res.send(out.buffer);
  }),
);

router.post(
  "/silva-gl-drop",
  requireRole(["spx_principal", "system_admin"]),
  catchAsync(async (req, res) => {
    const out = await exportService.silvaGlDrop(req.body, req.user);
    res.json({
      data: {
        exportId: out.exportId,
        fileName: out.fileName,
        filePath: out.filePath,
        rowCount: out.csv.split("\n").length - 1,
      },
    });
  }),
);

module.exports = router;
