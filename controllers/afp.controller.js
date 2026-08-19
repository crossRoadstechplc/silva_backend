const planning = require("./planning.controller");

exports.findAll = planning.findAllAfp;
exports.create = planning.createAfp;
exports.findOne = planning.findOneAfp;
exports.update = planning.updateAfp;
exports.submit = planning.submitAfp;
exports.approve = planning.approveAfp;
exports.close = planning.closeAfp;
