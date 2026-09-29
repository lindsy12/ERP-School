const invoiceService = require("../services/invoice.service");
const paymentService = require("../services/payment.service");
const expenseModel = require("../models/expense.model");
const campaignModel = require("../models/campaign.model");
const reportService = require("../services/report.service");
const { publish } = require("../services/rabbitmq.service");
const { validateInvoice, validatePayment, validateExpense, validateCampaign } = require("../validators/finance.validators");
const HttpError = require("../utils/httpError");

exports.createInvoice = async (req, res) => {
  const invoice = await invoiceService.create(validateInvoice(req.body));
  publish("finance.invoice.created", {
    eventId: `invoice-${invoice.id}-${Date.now()}`,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    studentId: invoice.student_id,
    amount: invoice.amount
  }).catch(err => console.warn("Invoice event not published:", err.message));
  res.status(201).json(invoice);
};

exports.listInvoices = async (req, res) => res.json(await invoiceService.list({
  studentId: req.query.studentId,
  status: req.query.status
}));

exports.getInvoice = async (req, res) => res.json(await invoiceService.get(req.params.id));

exports.listStudentInvoices = async (req, res) => res.json(await invoiceService.list({ studentId: req.params.studentId }));

exports.createPayment = async (req, res) => {
  const payment = await paymentService.create(validatePayment(req.body));
  publish("finance.payment.received", {
    eventId: `payment-${payment.id}-${Date.now()}`,
    paymentId: payment.id,
    invoiceId: payment.invoice_id,
    amount: payment.amount,
    method: payment.method
  }).catch(err => console.warn("Payment event not published:", err.message));
  res.status(201).json(payment);
};

exports.listPayments = async (req, res) => res.json(await paymentService.list(req.params.invoiceId));

exports.createMomoPayment = async (req, res) => {
  const body = { ...req.body, method: "MOBILE_MONEY", transactionRef: req.body.transactionRef || `MOMO-${Date.now()}` };
  if (!body.phoneNumber) throw new HttpError(400, "VALIDATION_ERROR", "phoneNumber is required for mobile-money payments");
  const payment = await paymentService.create(validatePayment(body));
  publish("finance.payment.received", {
    eventId: `payment-${payment.id}-${Date.now()}`,
    paymentId: payment.id,
    invoiceId: payment.invoice_id,
    amount: payment.amount,
    method: payment.method,
    phoneNumber: payment.phone_number
  }).catch(err => console.warn("Payment event not published:", err.message));
  res.status(201).json({ ...payment, provider: "MOCK_MOBILE_MONEY" });
};

exports.createExpense = async (req, res) => res.status(201).json(await expenseModel.create(validateExpense(req.body)));
exports.listExpenses = async (req, res) => res.json(await expenseModel.findAll());

exports.createCampaign = async (req, res) => res.status(201).json(await campaignModel.create(validateCampaign(req.body)));
exports.listCampaigns = async (req, res) => res.json(await campaignModel.findAll());
exports.updateCampaign = async (req, res) => {
  const campaign = await campaignModel.update(req.params.id, req.body);
  if (!campaign) throw new HttpError(404, "NOT_FOUND", "Campaign not found");
  res.json(campaign);
};

exports.monthlyReport = async (req, res) => {
  const now = new Date();
  const month = req.query.month || now.getMonth() + 1;
  const year = req.query.year || now.getFullYear();
  res.json(await reportService.monthly(month, year));
};
