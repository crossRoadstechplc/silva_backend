const { randomUUID } = require("crypto");

module.exports = (req, res, next) => {
  const incoming = req.header("X-Request-Id");
  req.requestId = incoming && incoming.trim() ? incoming.trim() : `req_${randomUUID().slice(0, 8)}`;
  res.setHeader("X-Request-Id", req.requestId);
  next();
};
