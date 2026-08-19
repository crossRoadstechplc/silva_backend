const { Prisma } = require("@prisma/client");

function money(value) {
  if (value === null || value === undefined) return null;
  return Math.round(Number(value) * 100) / 100;
}

function decimal(value) {
  return new Prisma.Decimal(money(value));
}

function iso(date) {
  if (!date) return null;
  return new Date(date).toISOString();
}

function isoDate(date) {
  if (!date) return null;
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

function parseListQuery(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    order: query.order === "asc" ? "asc" : "desc",
    q: typeof query.q === "string" ? query.q.trim() : "",
    statuses: query.status
      ? String(query.status)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  };
}

function meta(page, pageSize, total) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 0 };
}

module.exports = { money, decimal, iso, isoDate, parseListQuery, meta };
