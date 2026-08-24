const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const prisma = require("../config/database");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const { uuid, hashToken, rawToken } = require("../utils/ids");
const { decimal, parseListQuery, meta } = require("../utils/helpers");
const programService = require("./program.service");
const authService = require("./auth.service");
const notify = require("./workflowNotifications.service");

function adminRoleForOrgType(type) {
  if (type === "silva") return "silva_owner";
  return "vendor_admin";
}

function requestJson(row) {
  return {
    id: row.id,
    orgType: row.orgType,
    status: row.status,
    orgName: row.orgName,
    orgSlug: row.orgSlug,
    displayName: row.displayName,
    legalName: row.legalName,
    country: row.country,
    region: row.region,
    address: row.address,
    website: row.website,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    contactTitle: row.contactTitle,
    assetInterests: row.assetInterests,
    estimatedHectares: row.estimatedHectares != null ? Number(row.estimatedHectares) : null,
    governanceNotes: row.governanceNotes,
    vendorCategory: row.vendorCategory,
    servicesProvided: row.servicesProvided,
    insuranceOnFile: row.insuranceOnFile,
    fieldCapacity: row.fieldCapacity,
    profileJson: row.profileJson,
    reviewNotes: row.reviewNotes,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    provisionedOrgId: row.provisionedOrgId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reviewedBy: row.reviewedBy ? { id: row.reviewedBy.id, name: row.reviewedBy.name, email: row.reviewedBy.email } : null,
    provisionedOrg: row.provisionedOrg
      ? { id: row.provisionedOrg.id, name: row.provisionedOrg.name, slug: row.provisionedOrg.slug, type: row.provisionedOrg.type }
      : null,
  };
}

async function assertSlugAvailable(slug, excludeRequestId) {
  const orgTaken = await prisma.organizations.findUnique({ where: { slug } });
  if (orgTaken) throw new AppError(409, "CONFLICT", "Organization slug already taken.");
  const pending = await prisma.registration_requests.findFirst({
    where: {
      orgSlug: slug,
      status: { in: ["submitted", "under_review"] },
      ...(excludeRequestId ? { NOT: { id: excludeRequestId } } : {}),
    },
  });
  if (pending) throw new AppError(409, "CONFLICT", "This organization identifier is already reserved.");
}

function assertReviewRole(user) {
  if (!["system_admin", "spx_principal"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only SPX platform administrators can review registrations.");
  }
}

exports.submit = async (dto) => {
  if (!["silva", "vendor"].includes(dto.orgType)) {
    throw new AppError(400, "VALIDATION_ERROR", "Registration is only available for asset owners and vendors.");
  }
  const email = String(dto.contactEmail).toLowerCase();
  const existingUser = await prisma.users.findUnique({ where: { email } });
  if (existingUser) throw new AppError(409, "CONFLICT", "An account with this email already exists.");

  const pendingEmail = await prisma.registration_requests.findFirst({
    where: { contactEmail: email, status: { in: ["submitted", "under_review"] } },
  });
  if (pendingEmail) {
    throw new AppError(409, "CONFLICT", "A registration application for this email is already under review.");
  }

  const slug = programService.slugify(dto.orgSlug || dto.orgName);
  if (!slug) throw new AppError(400, "VALIDATION_ERROR", "Organization name is required.");
  await assertSlugAvailable(slug);

  const row = await prisma.registration_requests.create({
    data: {
      id: uuid("reg"),
      orgType: dto.orgType,
      orgName: dto.orgName.trim(),
      orgSlug: slug,
      displayName: dto.displayName?.trim() || dto.orgName.trim(),
      legalName: dto.legalName?.trim() || null,
      country: dto.country?.trim() || null,
      region: dto.region?.trim() || null,
      address: dto.address?.trim() || null,
      website: dto.website?.trim() || null,
      contactName: dto.contactName.trim(),
      contactEmail: email,
      contactPhone: dto.contactPhone?.trim() || null,
      contactTitle: dto.contactTitle?.trim() || null,
      assetInterests: dto.orgType === "silva" ? dto.assetInterests?.trim() || null : null,
      estimatedHectares:
        dto.orgType === "silva" && dto.estimatedHectares != null ? decimal(dto.estimatedHectares) : null,
      governanceNotes: dto.orgType === "silva" ? dto.governanceNotes?.trim() || null : null,
      vendorCategory: dto.orgType === "vendor" ? dto.vendorCategory?.trim() || "Field Operations" : null,
      servicesProvided: dto.orgType === "vendor" ? dto.servicesProvided?.trim() || null : null,
      insuranceOnFile: dto.orgType === "vendor" ? Boolean(dto.insuranceOnFile) : null,
      fieldCapacity: dto.orgType === "vendor" ? dto.fieldCapacity?.trim() || null : null,
      profileJson: dto.profileJson || null,
    },
  });

  await notify.registrationSubmitted(row);

  return {
    id: row.id,
    status: row.status,
    message: "Application received. SPX will review your registration and contact you to activate your workspace.",
  };
};

exports.findAll = async (query, user) => {
  assertReviewRole(user);
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.orgType) where.orgType = query.orgType;
  if (query.q) {
    where.OR = [
      { orgName: { contains: query.q, mode: "insensitive" } },
      { contactEmail: { contains: query.q, mode: "insensitive" } },
      { contactName: { contains: query.q, mode: "insensitive" } },
    ];
  }
  const [rows, total] = await Promise.all([
    prisma.registration_requests.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { reviewedBy: true, provisionedOrg: true },
    }),
    prisma.registration_requests.count({ where }),
  ]);
  return { items: rows.map(requestJson), meta: meta(page, pageSize, total) };
};

exports.findOne = async (id, user) => {
  assertReviewRole(user);
  const row = await prisma.registration_requests.findUnique({
    where: { id },
    include: { reviewedBy: true, provisionedOrg: true },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Registration request not found.");
  return requestJson(row);
};

exports.markUnderReview = async (id, user, notes) => {
  assertReviewRole(user);
  const row = await prisma.registration_requests.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Registration request not found.");
  if (!["submitted", "under_review"].includes(row.status)) {
    throw new AppError(400, "INVALID_STATE", "Only pending applications can be reviewed.");
  }
  const updated = await prisma.registration_requests.update({
    where: { id },
    data: { status: "under_review", reviewNotes: notes?.trim() || row.reviewNotes },
    include: { reviewedBy: true, provisionedOrg: true },
  });
  return requestJson(updated);
};

exports.approve = async (id, user, notes) => {
  assertReviewRole(user);
  const row = await prisma.registration_requests.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Registration request not found.");
  if (!["submitted", "under_review"].includes(row.status)) {
    throw new AppError(400, "INVALID_STATE", "Application is not pending approval.");
  }
  if (row.provisionedOrgId) {
    throw new AppError(409, "CONFLICT", "This application has already been provisioned.");
  }

  const email = row.contactEmail.toLowerCase();
  const existingUser = await prisma.users.findUnique({ where: { email } });
  if (existingUser) throw new AppError(409, "CONFLICT", "A user account already exists for this email.");

  await assertSlugAvailable(row.orgSlug, row.id);

  const activationToken = rawToken();
  const placeholderPassword = crypto.randomBytes(32).toString("hex");
  const passwordHash = await bcrypt.hash(placeholderPassword, env.BCRYPT_ROUNDS);
  const role = adminRoleForOrgType(row.orgType);
  const orgId = uuid("org");
  const userId = uuid("usr");

  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organizations.create({
      data: {
        id: orgId,
        name: row.orgName,
        slug: row.orgSlug,
        displayName: row.displayName || row.orgName,
        type: row.orgType,
        status: "active",
        active: true,
        brandingJson: { tagline: "" },
        vendor:
          row.orgType === "vendor"
            ? {
                create: {
                  id: uuid("vnd"),
                  name: row.orgName,
                  category: row.vendorCategory || "Field Operations",
                  servicesProvided: row.servicesProvided,
                  insuranceOnFile: Boolean(row.insuranceOnFile),
                  prequalified: false,
                  status: "pending",
                },
              }
            : undefined,
      },
      include: { vendor: true },
    });

    await tx.users.create({
      data: {
        id: userId,
        name: row.contactName,
        email,
        passwordHash,
        role,
        organizationId: org.id,
        vendorId: org.vendor?.id || null,
        active: false,
        memberships: { create: { id: uuid("mem"), organizationId: org.id, role } },
      },
    });

    const updated = await tx.registration_requests.update({
      where: { id: row.id },
      data: {
        status: "approved",
        reviewNotes: notes?.trim() || row.reviewNotes,
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
        provisionedOrgId: org.id,
        activationTokenHash: hashToken(activationToken),
        activationExpiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      },
      include: { reviewedBy: true, provisionedOrg: true },
    });

    return { org, request: updated };
  });

  return {
    request: requestJson(result.request),
    activationToken,
    activationPath: `/activate?token=${activationToken}`,
  };
};

exports.reject = async (id, user, notes) => {
  assertReviewRole(user);
  if (!notes?.trim()) throw new AppError(400, "VALIDATION_ERROR", "Rejection reason is required.");
  const row = await prisma.registration_requests.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Registration request not found.");
  if (!["submitted", "under_review"].includes(row.status)) {
    throw new AppError(400, "INVALID_STATE", "Application is not pending review.");
  }
  const updated = await prisma.registration_requests.update({
    where: { id },
    data: {
      status: "rejected",
      reviewNotes: notes.trim(),
      reviewedByUserId: user.id,
      reviewedAt: new Date(),
    },
    include: { reviewedBy: true, provisionedOrg: true },
  });
  return requestJson(updated);
};

exports.activate = async (dto) => {
  const row = await prisma.registration_requests.findFirst({
    where: {
      activationTokenHash: hashToken(dto.token),
      status: "approved",
      activationExpiresAt: { gt: new Date() },
    },
  });
  if (!row || !row.provisionedOrgId) {
    throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired activation link.");
  }

  const user = await prisma.users.findUnique({
    where: { email: row.contactEmail.toLowerCase() },
    include: { organization: true },
  });
  if (!user || user.active) {
    throw new AppError(409, "CONFLICT", "This account is already active or does not exist.");
  }

  const passwordHash = await bcrypt.hash(dto.password, env.BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.users.update({
      where: { id: user.id },
      data: {
        passwordHash,
        name: dto.name?.trim() || user.name,
        active: true,
      },
    }),
    prisma.registration_requests.update({
      where: { id: row.id },
      data: { activationTokenHash: null, activationExpiresAt: null },
    }),
  ]);

  const activated = await prisma.users.findUnique({
    where: { id: user.id },
    include: { organization: true },
  });
  return authService.reissueTokens(activated.id);
};

exports.checkActivation = async (token) => {
  const row = await prisma.registration_requests.findFirst({
    where: {
      activationTokenHash: hashToken(token),
      status: "approved",
      activationExpiresAt: { gt: new Date() },
    },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Invalid or expired activation link.");
  return {
    orgName: row.orgName,
    orgType: row.orgType,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
  };
};
