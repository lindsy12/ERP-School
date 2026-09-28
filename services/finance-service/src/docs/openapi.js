module.exports = {
  openapi: "3.0.3",
  info: { title: "Finance Service API", version: "1.0.0" },
  paths: {
    "/api/v1/finance/invoices": { post: { summary: "Create invoice" }, get: { summary: "List invoices" } },
    "/api/v1/finance/payments": { post: { summary: "Record payment" }, get: { summary: "List payments" } },
    "/api/v1/finance/payments/momo": { post: { summary: "Record mock mobile-money payment" } },
    "/api/v1/finance/expenses": { post: { summary: "Create expense" }, get: { summary: "List expenses" } },
    "/api/v1/finance/campaigns": { post: { summary: "Create campaign" }, get: { summary: "List campaigns" } },
    "/api/v1/finance/reports/monthly": { get: { summary: "Get monthly financial report" } }
  }
};
