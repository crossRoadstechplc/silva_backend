const catchAsync = require("../utils/catchAsync");
const workOrderService = require("../services/workOrder.service");
const fieldTicketService = require("../services/fieldTicket.service");
const paymentRequestService = require("../services/paymentRequest.service");
const settlementService = require("../services/settlement.service");

exports.findAllWo = catchAsync(async (req, res) => {
  const { items, meta } = await workOrderService.findAll(req.query, req.user);
  res.json({ data: items, meta });
});
exports.createWo = catchAsync(async (req, res) => {
  const data = await workOrderService.create(req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.findOneWo = catchAsync(async (req, res) => {
  const data = await workOrderService.findOne(req.params.workOrderId, req.user);
  res.json({ data });
});
exports.updateWo = catchAsync(async (req, res) => {
  const data = await workOrderService.update(req.params.workOrderId, req.body, req.user);
  res.json({ data });
});
exports.issueWo = catchAsync(async (req, res) => {
  const data = await workOrderService.issue(req.params.workOrderId, req.user);
  res.json({ data });
});
exports.startWo = catchAsync(async (req, res) => {
  const data = await workOrderService.start(req.params.workOrderId);
  res.json({ data });
});
exports.completeWo = catchAsync(async (req, res) => {
  const data = await workOrderService.complete(req.params.workOrderId);
  res.json({ data });
});
exports.closeWo = catchAsync(async (req, res) => {
  const data = await workOrderService.close(req.params.workOrderId);
  res.json({ data });
});
exports.listAssignments = catchAsync(async (req, res) => {
  const data = await workOrderService.listAssignments(req.params.workOrderId);
  res.json({ data });
});
exports.addAssignment = catchAsync(async (req, res) => {
  const data = await workOrderService.addAssignment(req.params.workOrderId, req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.patchAssignment = catchAsync(async (req, res) => {
  const data = await workOrderService.patchAssignment(req.params.workOrderId, req.params.assignmentId, req.body);
  res.json({ data });
});
exports.listTasks = catchAsync(async (req, res) => {
  const data = await workOrderService.listTasks(req.params.workOrderId);
  res.json({ data });
});
exports.createTask = catchAsync(async (req, res) => {
  const data = await workOrderService.createTask(req.params.workOrderId, req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.findTask = catchAsync(async (req, res) => {
  const data = await workOrderService.findTask(req.params.taskId);
  res.json({ data });
});
exports.updateTask = catchAsync(async (req, res) => {
  const data = await workOrderService.updateTask(req.params.taskId, req.body);
  res.json({ data });
});
exports.startTask = catchAsync(async (req, res) => {
  const data = await workOrderService.startTask(req.params.taskId);
  res.json({ data });
});
exports.completeTask = catchAsync(async (req, res) => {
  const data = await workOrderService.completeTask(req.params.taskId);
  res.json({ data });
});
exports.cancelTask = catchAsync(async (req, res) => {
  const data = await workOrderService.cancelTask(req.params.taskId);
  res.json({ data });
});

exports.findAllFt = catchAsync(async (req, res) => {
  const { items, meta } = await fieldTicketService.findAll(req.query, req.user);
  res.json({ data: items, meta });
});
exports.createFt = catchAsync(async (req, res) => {
  const data = await fieldTicketService.create(req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.findOneFt = catchAsync(async (req, res) => {
  const data = await fieldTicketService.findOne(req.params.fieldTicketId, req.user);
  res.json({ data });
});
exports.updateFt = catchAsync(async (req, res) => {
  const data = await fieldTicketService.update(req.params.fieldTicketId, req.body, req.user);
  res.json({ data });
});
exports.submitFt = catchAsync(async (req, res) => {
  const data = await fieldTicketService.submit(req.params.fieldTicketId, req.user);
  res.json({ data });
});
exports.vendorReviewFt = catchAsync(async (req, res) => {
  const data = await fieldTicketService.vendorReview(req.params.fieldTicketId, req.user);
  res.json({ data });
});
exports.validateFt = catchAsync(async (req, res) => {
  const data = await fieldTicketService.validate(req.params.fieldTicketId, req.user);
  res.json({ data });
});
exports.rejectFt = catchAsync(async (req, res) => {
  const data = await fieldTicketService.reject(req.params.fieldTicketId, req.body.reason, req.user);
  res.json({ data });
});
exports.ftHistory = catchAsync(async (req, res) => {
  const data = await fieldTicketService.getHistory(req.params.fieldTicketId);
  res.json({ data });
});

exports.findAllPr = catchAsync(async (req, res) => {
  const { items, meta } = await paymentRequestService.findAll(req.query, req.user);
  res.json({ data: items, meta });
});
exports.createPr = catchAsync(async (req, res) => {
  const data = await paymentRequestService.create(req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.findOnePr = catchAsync(async (req, res) => {
  const data = await paymentRequestService.findOne(req.params.paymentRequestId, req.user);
  res.json({ data });
});
exports.updatePr = catchAsync(async (req, res) => {
  const data = await paymentRequestService.update(req.params.paymentRequestId, req.body, req.user);
  res.json({ data });
});
exports.submitPr = catchAsync(async (req, res) => {
  const data = await paymentRequestService.submit(req.params.paymentRequestId, req.user);
  res.json({ data });
});
exports.verifyPr = catchAsync(async (req, res) => {
  const data = await paymentRequestService.verify(req.params.paymentRequestId, req.user);
  res.json({ data });
});
exports.rejectPr = catchAsync(async (req, res) => {
  const data = await paymentRequestService.reject(req.params.paymentRequestId, req.body.reason, req.user);
  res.json({ data });
});
exports.settlePr = catchAsync(async (req, res) => {
  const data = await paymentRequestService.settle(req.params.paymentRequestId, req.body?.settlementId, req.user);
  res.json({ data });
});
exports.prHistory = catchAsync(async (req, res) => {
  const data = await paymentRequestService.getHistory(req.params.paymentRequestId);
  res.json({ data });
});

exports.findAllStl = catchAsync(async (req, res) => {
  const { items, meta } = await settlementService.findAll(req.query, req.user);
  res.json({ data: items, meta });
});
exports.createStl = catchAsync(async (req, res) => {
  const data = await settlementService.create(req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.findOneStl = catchAsync(async (req, res) => {
  const data = await settlementService.findOne(req.params.settlementId, req.user);
  res.json({ data });
});
exports.updateStl = catchAsync(async (req, res) => {
  const data = await settlementService.update(req.params.settlementId, req.body, req.user);
  res.json({ data });
});
exports.authorizeStl = catchAsync(async (req, res) => {
  const data = await settlementService.authorize(req.params.settlementId, req.user);
  res.json({ data });
});
exports.markSettled = catchAsync(async (req, res) => {
  const data = await settlementService.markSettled(req.params.settlementId, req.user);
  res.json({ data });
});
