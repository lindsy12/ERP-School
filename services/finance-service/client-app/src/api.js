// Calls go through the gateway (/api/v1/finance), with the sign-in shared by every ERP module:
// /auth/js/session.js adds the access token and renews it when it expires. It is loaded at run
// time from the gateway, not bundled, so every module uses the same copy.
const API = "/api/v1/finance";
const DEFAULT_TIMEOUT_MS = 8000;
const SESSION_MODULE = "/auth/js/session.js";

let sessionPromise;
export const session = () => (sessionPromise ??= import(/* @vite-ignore */ SESSION_MODULE));

function isTimeoutError(error) {
  return error?.name === "AbortError" || error?.code === "REQUEST_TIMEOUT";
}

async function request(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const { api } = await session();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error("The Finance server took too long to respond. I will check whether the record was saved before asking you to try again.");
      e.code = "REQUEST_TIMEOUT";
      reject(e);
    }, timeoutMs);
  });
  try {
    const body = options.body !== undefined ? JSON.parse(options.body) : undefined;
    return await Promise.race([api(`${API}${path}`, { method: options.method || "GET", body }), timeout]);
  } catch (error) {
    if (error instanceof TypeError && /fetch/i.test(error.message)) {
      throw new Error("Cannot reach the Finance backend. Please make sure the ERP backend is running.");
    }
    throw error;
  } finally { clearTimeout(timer); }
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function recoverAfterTimeout(listPath, matcher, label) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await wait(1000);
    try {
      const records = await request(listPath, {}, 3500);
      const found = (Array.isArray(records) ? records : []).find(matcher);
      if (found) return found;
    } catch (_) { /* keep checking briefly */ }
  }
  throw new Error(`${label} was not confirmed by the Finance server. Refresh the page before submitting another one.`);
}

async function createWithRecovery({ postPath, body, listPath, matcher, label }) {
  try {
    return await request(postPath, { method: "POST", body: JSON.stringify(body) }, 6000);
  } catch (error) {
    if (!isTimeoutError(error)) throw error;
    return recoverAfterTimeout(listPath, matcher, label);
  }
}

export const financeApi = {
  invoices: (query = "") => request(`/invoices${query}`),
  invoice: id => request(`/invoices/${id}`),
  createInvoice: body => createWithRecovery({
    postPath: "/invoices", body, listPath: `/invoices?studentId=${encodeURIComponent(body.studentId)}`,
    matcher: i => String(i.student_id ?? i.studentId) === String(body.studentId)
      && Number(i.amount) === Number(body.amount)
      && String(i.academic_year ?? i.academicYear) === String(body.academicYear),
    label: "The invoice"
  }),
  payments: () => request("/payments"),
  invoicePayments: id => request(`/invoices/${id}/payments`),
  createPayment: body => createWithRecovery({
    postPath: "/payments", body, listPath: "/payments",
    matcher: p => String(p.invoice_id ?? p.invoiceId) === String(body.invoiceId)
      && Number(p.amount) === Number(body.amount)
      && String(p.method) === String(body.method),
    label: "The payment"
  }),
  momo: body => createWithRecovery({
    postPath: "/payments/momo", body, listPath: "/payments",
    matcher: p => String(p.invoice_id ?? p.invoiceId) === String(body.invoiceId)
      && Number(p.amount) === Number(body.amount),
    label: "The Mobile Money payment"
  }),
  expenses: () => request("/expenses"),
  createExpense: body => createWithRecovery({
    postPath: "/expenses", body, listPath: "/expenses",
    matcher: x => String(x.description) === String(body.description)
      && Number(x.amount) === Number(body.amount)
      && String(x.expense_date ?? x.expenseDate).slice(0,10) === String(body.expenseDate).slice(0,10),
    label: "The expense"
  }),
  campaigns: () => request("/campaigns"),
  createCampaign: body => createWithRecovery({
    postPath: "/campaigns", body, listPath: "/campaigns",
    matcher: x => String(x.name) === String(body.name)
      && Number(x.budget) === Number(body.budget)
      && String(x.start_date ?? x.startDate).slice(0,10) === String(body.startDate).slice(0,10),
    label: "The campaign"
  }),
  updateCampaign: (id, body) => request(`/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  report: (month, year) => request(`/reports/monthly?month=${month}&year=${year}`)
};
