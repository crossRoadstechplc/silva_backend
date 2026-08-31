const catchAsync = require("../../utils/catchAsync");
const cropfortAuditService = require("../../services/cropfort/cropfortAudit.service");

exports.list = catchAsync(async (req, res) => {
  const data = await cropfortAuditService.list(req.user, req.query);
  res.json({ data });
});
