const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");
const { parseListQuery, meta } = require("../utils/helpers");
const notify = require("./workflowNotifications.service");

function submissionJson(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    organization: row.organization,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function assertSpxReview(user) {
  if (!["system_admin", "spx_principal"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only SPX platform administrators can view contact submissions.");
  }
}

exports.submit = async (dto) => {
  const row = await prisma.contact_submissions.create({
    data: {
      id: uuid("ctc"),
      name: dto.name.trim(),
      email: String(dto.email).toLowerCase().trim(),
      organization: dto.organization?.trim() || null,
      subject: dto.subject.trim(),
      message: dto.message.trim(),
    },
  });

  await notify.contactReceived(row);

  return {
    id: row.id,
    message: "Thanks for reaching out. The platform team will respond by email.",
  };
};

exports.findAll = async (query, user) => {
  assertSpxReview(user);
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { email: { contains: query.q, mode: "insensitive" } },
      { organization: { contains: query.q, mode: "insensitive" } },
      { subject: { contains: query.q, mode: "insensitive" } },
      { message: { contains: query.q, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.contact_submissions.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    prisma.contact_submissions.count({ where }),
  ]);

  return { items: rows.map(submissionJson), meta: meta(page, pageSize, total) };
};

exports.markRead = async (id, user) => {
  assertSpxReview(user);
  const row = await prisma.contact_submissions.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Contact submission not found.");
  const updated = await prisma.contact_submissions.update({
    where: { id },
    data: { status: "read" },
  });
  return submissionJson(updated);
};
