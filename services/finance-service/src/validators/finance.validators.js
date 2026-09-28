const HttpError = require("../utils/httpError");

function required(value, field) {
  if (value === undefined || value === null || value === "") {
    throw new HttpError(400, "VALIDATION_ERROR", `${field} is required`);
  }
}

function positiveAmount(value, field = "amount") {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, "VALIDATION_ERROR", `${field} must be a positive number`);
  }
  return amount;
}

function validateInvoice(body) {
  required(body.studentId, "studentId");
  required(body.academicYear, "academicYear");
  required(body.amount, "amount");
  required(body.dueDate, "dueDate");
  return {
    studentId: String(body.studentId),
    academicYear: String(body.academicYear),
    amount: positiveAmount(body.amount),
    dueDate: body.dueDate
  };
}

function validatePayment(body) {
  required(body.invoiceId, "invoiceId");
  required(body.amount, "amount");
  required(body.method, "method");
  const methods = ["CASH", "BANK_TRANSFER", "MOBILE_MONEY"];
  if (!methods.includes(String(body.method).toUpperCase())) {
    throw new HttpError(400, "VALIDATION_ERROR", `method must be one of ${methods.join(", ")}`);
  }
  return {
    invoiceId: Number(body.invoiceId),
    amount: positiveAmount(body.amount),
    method: String(body.method).toUpperCase(),
    transactionRef: body.transactionRef ? String(body.transactionRef) : null,
    phoneNumber: body.phoneNumber ? String(body.phoneNumber) : null
  };
}

function validateExpense(body) {
  required(body.description, "description");
  required(body.amount, "amount");
  required(body.expenseDate, "expenseDate");
  return {
    description: String(body.description),
    category: body.category ? String(body.category) : "OTHER",
    amount: positiveAmount(body.amount),
    expenseDate: body.expenseDate
  };
}

function validateCampaign(body) {
  required(body.name, "name");
  required(body.budget, "budget");
  required(body.startDate, "startDate");
  required(body.endDate, "endDate");
  return {
    name: String(body.name),
    budget: positiveAmount(body.budget, "budget"),
    startDate: body.startDate,
    endDate: body.endDate,
    leads: Number(body.leads || 0),
    conversions: Number(body.conversions || 0),
    revenue: Number(body.revenue || 0)
  };
}

module.exports = { validateInvoice, validatePayment, validateExpense, validateCampaign, positiveAmount };
