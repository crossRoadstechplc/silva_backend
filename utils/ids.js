const { randomUUID, createHash, randomBytes } = require("crypto");
const prisma = require("../config/database");

function uuid(prefix) {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function rawToken(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

async function nextTextId(name, prefix, pad = 4) {
  const row = await prisma.id_sequences.upsert({
    where: { name },
    create: { name, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });
  return `${prefix}-${String(row.lastValue).padStart(pad, "0")}`;
}

async function nextAfpId(year) {
  const name = `afp-${year}`;
  const row = await prisma.id_sequences.upsert({
    where: { name },
    create: { name, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });
  return `AFP-${year}-${String(row.lastValue).padStart(3, "0")}`;
}

module.exports = { uuid, hashToken, rawToken, nextTextId, nextAfpId };
