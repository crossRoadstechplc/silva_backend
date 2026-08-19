const planning = require("./planning.controller");

exports.findAll = planning.findAllAfe;
exports.create = planning.createAfe;
exports.findOne = planning.findOneAfe;
exports.update = planning.updateAfe;
exports.submit = planning.submitAfe;
exports.validate = planning.validateAfe;
exports.approve = planning.approveAfe;
exports.reject = planning.rejectAfe;
exports.close = planning.closeAfe;
exports.getHistory = planning.afeHistory;
