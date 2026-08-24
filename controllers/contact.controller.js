const catchAsync = require("../utils/catchAsync");
const contactService = require("../services/contact.service");

exports.submit = catchAsync(async (req, res) => {
  const data = await contactService.submit(req.validatedBody);
  res.status(201).json({ data });
});

exports.list = catchAsync(async (req, res) => {
  const { items, meta } = await contactService.findAll(req.query, req.user);
  res.json({ data: items, meta });
});

exports.markRead = catchAsync(async (req, res) => {
  const data = await contactService.markRead(req.params.id, req.user);
  res.json({ data });
});
