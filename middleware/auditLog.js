const prisma = require("../config/database");
const { uuid } = require("../utils/ids");

module.exports = (entityType, actionField = "action") => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      if (res.statusCode < 400 && req.user && !req.restrictedExport) {
        const entityId = req.params.id || req.params.afeId || req.params.afpLineId || req.params.workOrderId || req.params.fieldTicketId || req.params.paymentRequestId || req.params.settlementId || (body && body.data && body.data.id) || null;
        const action = req.body?.[actionField] || inferAction(req.method, req.path);

        prisma.audit_log
          .create({
            data: {
              id: uuid("aud"),
              userId: req.user.id,
              entityType,
              entityId: entityId ? String(entityId) : "unknown",
              action,
              oldValue: req.method === "POST" ? undefined : req.body || undefined,
              newValue: body && body.data ? body.data : body,
            },
          })
          .catch((err) => {
            console.error("Failed to create audit log:", err);
          });
      }
      return originalJson(body);
    };

    next();
  };
};

function inferAction(method, path) {
  if (/\/approve/.test(path)) return "approve";
  if (/\/reject/.test(path)) return "reject";
  if (/\/submit/.test(path)) return "submit";
  if (/\/validate/.test(path)) return "validate";
  if (/\/verify/.test(path)) return "verify";
  if (/\/release/.test(path)) return "release";
  if (method === "POST") return "create";
  if (method === "PATCH" || method === "PUT") return "update";
  return method.toLowerCase();
}
