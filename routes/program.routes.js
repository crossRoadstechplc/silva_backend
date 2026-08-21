const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const programService = require("../services/program.service");
const catchAsync = require("../utils/catchAsync");
const schemas = require("../schemas");

const router = express.Router();

router.use(authenticateJWT);

router.get(
  "/",
  catchAsync(async (req, res) => {
    const data = await programService.listPrograms(req.user);
    res.json({ data });
  }),
);

router.post(
  "/",
  validate(schemas.programCreate),
  catchAsync(async (req, res) => {
    const data = await programService.createProgram(req.user, req.validatedBody);
    res.status(201).json({ data });
  }),
);

router.post(
  "/accept-invite",
  validate(schemas.acceptProgramInvite),
  catchAsync(async (req, res) => {
    const data = await programService.acceptProgramInvite(req.user, req.validatedBody.token);
    res.json({ data });
  }),
);

router.get(
  "/:programId",
  catchAsync(async (req, res) => {
    const data = await programService.getProgram(req.user, req.params.programId);
    res.json({ data });
  }),
);

router.get(
  "/:programId/members",
  catchAsync(async (req, res) => {
    const data = await programService.listMembers(req.user, req.params.programId);
    res.json({ data });
  }),
);

router.get(
  "/:programId/invites",
  catchAsync(async (req, res) => {
    const data = await programService.listOrgInvites(req.user, req.params.programId);
    res.json({ data });
  }),
);

router.post(
  "/:programId/invite-org",
  validate(schemas.programInviteOrg),
  catchAsync(async (req, res) => {
    const data = await programService.inviteOrganization(req.user, req.params.programId, req.validatedBody);
    res.status(201).json({ data });
  }),
);

module.exports = router;
