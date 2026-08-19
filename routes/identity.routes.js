const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const authController = require("../controllers/auth.controller");
const schemas = require("../schemas");

const SPX_ADMIN = ["spx_principal", "system_admin"];
const SPX = ["spx_principal", "system_admin", "spx_account_handler"];

const orgRouter = express.Router();
orgRouter.use(authenticateJWT);
orgRouter.get("/", authController.listOrganizations);
orgRouter.get("/:organizationId", authController.getOrganization);
orgRouter.post("/", requireRole(SPX_ADMIN), validate(schemas.orgCreate), authController.createOrganization);
orgRouter.patch("/:organizationId", requireRole(SPX), validate(schemas.orgPatch), authController.patchOrganization);
orgRouter.get("/:organizationId/members", authController.listMembers);
orgRouter.post("/:organizationId/invites", validate(schemas.inviteCreate), authController.createInvite);
orgRouter.get("/:organizationId/invites", authController.listInvites);

const inviteRouter = express.Router();
inviteRouter.post("/:inviteId/accept", validate(schemas.inviteAccept), authController.acceptInvite);
inviteRouter.post("/:inviteId/revoke", authenticateJWT, authController.revokeInvite);

const userRouter = express.Router();
userRouter.use(authenticateJWT);
userRouter.get("/", authController.listUsers);
userRouter.get("/:userId", authController.getUser);
userRouter.post("/", requireRole(SPX_ADMIN), validate(schemas.userCreate), authController.createUser);
userRouter.patch("/:userId", validate(schemas.userPatch), authController.patchUser);
userRouter.post("/:userId/activate", authController.activateUser);
userRouter.post("/:userId/deactivate", authController.deactivateUser);

const membershipRouter = express.Router();
membershipRouter.patch("/:membershipId/role", authenticateJWT, validate(schemas.membershipRole), authController.changeMembershipRole);

module.exports = { orgRouter, inviteRouter, userRouter, membershipRouter };
