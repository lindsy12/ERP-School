const invoiceModel = require("../models/invoice.model");
const paymentModel = require("../models/payment.model");
const HttpError = require("../utils/httpError");

async function create(data) {
  return invoiceModel.create(data);
}

async function get(id) {
  const invoice = await invoiceModel.findById(id);
  if (!invoice) throw new HttpError(404, "NOT_FOUND", "Invoice not found");
  const totalPaid = await paymentModel.totalsForInvoice(id);
  return { ...invoice, total_paid: totalPaid, balance: Math.max(0, Number(invoice.amount) - totalPaid) };
}

async function list(query) {
  return invoiceModel.findAll(query);
}

module.exports = { create, get, list };
