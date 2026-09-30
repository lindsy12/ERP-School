const invoiceModel = require("../models/invoice.model");
const paymentModel = require("../models/payment.model");
const HttpError = require("../utils/httpError");

async function create(data) {
  const invoice = await invoiceModel.findById(data.invoiceId);
  if (!invoice) throw new HttpError(404, "NOT_FOUND", "Invoice not found");

  const alreadyPaid = await paymentModel.totalsForInvoice(data.invoiceId);
  const balance = Number(invoice.amount) - alreadyPaid;
  if (data.amount > balance) {
    throw new HttpError(400, "PAYMENT_EXCEEDS_BALANCE", "Payment amount exceeds invoice balance");
  }

  const payment = await paymentModel.create(data);
  const totalPaid = alreadyPaid + Number(data.amount);
  await invoiceModel.updateStatus(data.invoiceId, totalPaid >= Number(invoice.amount) ? "PAID" : "PARTIALLY_PAID");
  return payment;
}

async function list(invoiceId) {
  return paymentModel.findAll(invoiceId ? { invoiceId } : {});
}

module.exports = { create, list };
