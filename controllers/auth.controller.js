const catchAsync = require("../utils/catchAsync");
const authService = require("../services/auth.service");

exports.login = catchAsync(async (req, res) => {
  const data = await authService.login(req.validatedBody.email, req.validatedBody.password);
  res.json({ data });
});

exports.logout = catchAsync(async (req, res) => {
  await authService.logout(req.user?.id, req.body?.refreshToken);
  res.json({ data: { ok: true } });
});

exports.refresh = catchAsync(async (req, res) => {
  const data = await authService.refresh(req.validatedBody.refreshToken);
  res.json({ data });
});

exports.me = catchAsync(async (req, res) => {
  const data = await authService.me(req.user);
  res.json({ data });
});

exports.forgot = catchAsync(async (req, res) => {
  await authService.forgotPassword(req.validatedBody.email);
  res.json({ data: { ok: true } });
});

exports.reset = catchAsync(async (req, res) => {
  await authService.resetPassword(req.validatedBody.token, req.validatedBody.password);
  res.json({ data: { ok: true } });
});

exports.listOrganizations = catchAsync(async (req, res) => {
  const { items, meta } = await authService.listOrganizations(req.user, req.query);
  res.json({ data: items, meta });
});

exports.getOrganization = catchAsync(async (req, res) => {
  const data = await authService.getOrganization(req.user, req.params.organizationId);
  res.json({ data });
});

exports.createOrganization = catchAsync(async (req, res) => {
  const data = await authService.createOrganization(req.user, req.validatedBody);
  res.status(201).json({ data });
});

exports.patchOrganization = catchAsync(async (req, res) => {
  const data = await authService.patchOrganization(req.user, req.params.organizationId, req.validatedBody);
  res.json({ data });
});

exports.listMembers = catchAsync(async (req, res) => {
  const { items, meta } = await authService.listMembers(req.user, req.params.organizationId, req.query);
  res.json({ data: items, meta });
});

exports.createInvite = catchAsync(async (req, res) => {
  const data = await authService.createInvite(req.user, req.params.organizationId, req.validatedBody);
  res.status(201).json({ data });
});

exports.listInvites = catchAsync(async (req, res) => {
  const { items, meta } = await authService.listInvites(req.user, req.params.organizationId, req.query);
  res.json({ data: items, meta });
});

exports.acceptInvite = catchAsync(async (req, res) => {
  const data = await authService.acceptInvite(req.params.inviteId, req.validatedBody);
  res.json({ data });
});

exports.revokeInvite = catchAsync(async (req, res) => {
  const data = await authService.revokeInvite(req.user, req.params.inviteId);
  res.json({ data });
});

exports.listUsers = catchAsync(async (req, res) => {
  const { items, meta } = await authService.listUsers(req.user, req.query);
  res.json({ data: items, meta });
});

exports.getUser = catchAsync(async (req, res) => {
  const data = await authService.getUser(req.user, req.params.userId);
  res.json({ data });
});

exports.createUser = catchAsync(async (req, res) => {
  const data = await authService.createUser(req.user, req.validatedBody);
  res.status(201).json({ data });
});

exports.patchUser = catchAsync(async (req, res) => {
  const data = await authService.patchUser(req.user, req.params.userId, req.validatedBody);
  res.json({ data });
});

exports.activateUser = catchAsync(async (req, res) => {
  const data = await authService.setUserActive(req.user, req.params.userId, true);
  res.json({ data });
});

exports.deactivateUser = catchAsync(async (req, res) => {
  const data = await authService.setUserActive(req.user, req.params.userId, false);
  res.json({ data });
});

exports.changeMembershipRole = catchAsync(async (req, res) => {
  const data = await authService.changeMembershipRole(req.user, req.params.membershipId, req.validatedBody.role);
  res.json({ data });
});
