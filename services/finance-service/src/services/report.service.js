const pool = require("../db/connection");

async function monthly(month, year) {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y)) {
    const err = new Error("month must be 1-12 and year must be a valid year");
    err.status = 400; err.code = "VALIDATION_ERROR"; throw err;
  }

  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = new Date(y, m, 1).toISOString().slice(0, 10);

  const [[invoice]] = await pool.query(
    "SELECT COALESCE(SUM(amount),0) AS invoiced FROM invoices WHERE created_at >= ? AND created_at < ?",
    [start, end]
  );
  const [[payment]] = await pool.query(
    "SELECT COALESCE(SUM(amount),0) AS received FROM payments WHERE paid_at >= ? AND paid_at < ? AND status='COMPLETED'",
    [start, end]
  );
  const [[expense]] = await pool.query(
    "SELECT COALESCE(SUM(amount),0) AS expenses FROM expenses WHERE expense_date >= ? AND expense_date < ?",
    [start, end]
  );
  const [[campaign]] = await pool.query(
    "SELECT COALESCE(SUM(budget),0) AS campaign_budget, COALESCE(SUM(revenue),0) AS campaign_revenue, COALESCE(SUM(leads),0) AS leads, COALESCE(SUM(conversions),0) AS conversions FROM campaigns WHERE start_date < ? AND end_date >= ?",
    [end, start]
  );

  const received = Number(payment.received);
  const expenses = Number(expense.expenses);
  return {
    month: m,
    year: y,
    currency: "FCFA",
    invoices_issued: Number(invoice.invoiced),
    payments_received: received,
    expenses: expenses,
    net_cash_flow: received - expenses,
    campaign: {
      budget: Number(campaign.campaign_budget),
      revenue: Number(campaign.campaign_revenue),
      leads: Number(campaign.leads),
      conversions: Number(campaign.conversions),
      roi_percent: Number(campaign.campaign_budget) > 0
        ? ((Number(campaign.campaign_revenue) - Number(campaign.campaign_budget)) / Number(campaign.campaign_budget)) * 100
        : 0
    }
  };
}

module.exports = { monthly };
