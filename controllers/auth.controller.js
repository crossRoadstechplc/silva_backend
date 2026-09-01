const catchAsync = require("../utils/catchAsync");
const { resolveAppBaseUrl } = require("../utils/appBaseUrl");
const authService = require("../services/auth.service");
const authTotp = require("../services/auth.totp.service");

exports.config = catchAsync(async (_req, res) => {
  res.json({ data: { otpOnLogin: authTotp.otpEnabled() } });
});

exports.login = catchAsync(async (req, res) => {
  const data = await authService.login(req.validatedBody.email, req.validatedBody.password);
  res.json({ data });
});

exports.signup = catchAsync(async (req, res) => {
  const data = await authService.signup(req.validatedBody);
  res.status(201).json({ data });
});

exports.switchProgram = catchAsync(async (req, res) => {
  const programService = require("../services/program.service");
  const program = await programService.switchProgram(req.user, req.validatedBody.programId);
  const tokens = await authService.reissueTokens(req.user.id);
  const me = await authService.me({ id: req.user.id });
  res.json({ data: { ...tokens, activeProgram: program, me } });
});

exports.updateTenantBranding = catchAsync(async (req, res) => {
  const programService = require("../services/program.service");
  const data = await programService.updateTenantBranding(req.user, req.validatedBody);
  res.json({ data });
});

exports.completeOnboarding = catchAsync(async (req, res) => {
  const programService = require("../services/program.service");
  const data = await programService.completeOnboarding(req.user, req.validatedBody);
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

exports.changePassword = catchAsync(async (req, res) => {
  const data = await authService.changePassword(req.user, req.validatedBody);
  res.json({ data });
});

exports.verifyOtp = catchAsync(async (req, res) => {
  const data = await authService.verifyOtp(
    req.validatedBody.otpChallengeToken,
    req.validatedBody.code,
    req.validatedBody.deviceLabel,
  );
  const me = await authService.me({ id: data.user.id });
  res.json({ data: { ...data, me } });
});

exports.enrollTotp = catchAsync(async (req, res) => {
  const data = await authService.enrollTotp(req.validatedBody.enrollmentToken, req.validatedBody.code);
  const me = await authService.me({ id: data.user.id });
  res.json({ data: { ...data, me } });
});

exports.listSessions = catchAsync(async (req, res) => {
  const data = await authService.listSessions(req.user.id);
  res.json({ data });
});

exports.revokeSession = catchAsync(async (req, res) => {
  const data = await authService.revokeSession(req.user.id, req.params.sessionId);
  res.json({ data });
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
  const appBaseUrl = resolveAppBaseUrl(req);
  const data = await authService.createInvite(req.user, req.params.organizationId, req.validatedBody, {
    appBaseUrl,
  });
  res.status(201).json({ data });
});

exports.listInvites = catchAsync(async (req, res) => {
  const { items, meta } = await authService.listInvites(req.user, req.params.organizationId, req.query);
  res.json({ data: items, meta });
});

exports.previewInvite = catchAsync(async (req, res) => {
  const data = await authService.previewInvite(req.params.inviteId, req.query.token);
  res.json({ data });
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
