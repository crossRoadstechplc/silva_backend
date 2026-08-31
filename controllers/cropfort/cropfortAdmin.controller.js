const catchAsync = require("../../utils/catchAsync");
const cropfortAdminService = require("../../services/cropfort/cropfortAdmin.service");

exports.listUsers = catchAsync(async (req, res) => {
  const data = await cropfortAdminService.listUsers(req.user);
  res.json({ data });
});

exports.provisionUser = catchAsync(async (req, res) => {
  const data = await cropfortAdminService.provisionUser(req.user, req.validatedBody);
  res.status(201).json({ data });
});

exports.assignRoles = catchAsync(async (req, res) => {
  const data = await cropfortAdminService.assignRoles(req.user, req.params.userId, req.validatedBody);
  res.json({ data });
});

exports.suspendUser = catchAsync(async (req, res) => {
  const data = await cropfortAdminService.suspendUser(req.user, req.params.userId);
  res.json({ data });
});

exports.activateUser = catchAsync(async (req, res) => {
  const data = await cropfortAdminService.activateUser(req.user, req.params.userId);
  res.json({ data });
});

exports.getTenantConfig = catchAsync(async (req, res) => {
  const data = await cropfortAdminService.getTenantConfig(req.user);
  res.json({ data });
});

exports.updateTenantConfig = catchAsync(async (req, res) => {
  const data = await cropfortAdminService.updateTenantConfig(req.user, req.validatedBody);
  res.json({ data });
});
