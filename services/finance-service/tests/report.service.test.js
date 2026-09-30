jest.mock("../src/db/connection", () => ({
  query: jest.fn()
}));

const pool = require("../src/db/connection");
const reportService = require("../src/services/report.service");

describe("Report service", () => {
  beforeEach(() => jest.clearAllMocks());

  test("rejects an invalid month", async () => {
    await expect(reportService.monthly(13, 2026)).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR"
    });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test("builds a monthly financial report", async () => {
    pool.query
      .mockResolvedValueOnce([[{ invoiced: "250000" }]])
      .mockResolvedValueOnce([[{ received: "150000" }]])
      .mockResolvedValueOnce([[{ expenses: "30000" }]])
      .mockResolvedValueOnce([[{
        campaign_budget: "500000",
        campaign_revenue: "750000",
        leads: "100",
        conversions: "25"
      }]]);

    await expect(reportService.monthly(9, 2026)).resolves.toEqual({
      month: 9,
      year: 2026,
      currency: "FCFA",
      invoices_issued: 250000,
      payments_received: 150000,
      expenses: 30000,
      net_cash_flow: 120000,
      campaign: {
        budget: 500000,
        revenue: 750000,
        leads: 100,
        conversions: 25,
        roi_percent: 50
      }
    });
  });

  test("returns zero campaign ROI when budget is zero", async () => {
    pool.query
      .mockResolvedValueOnce([[{ invoiced: "0" }]])
      .mockResolvedValueOnce([[{ received: "0" }]])
      .mockResolvedValueOnce([[{ expenses: "0" }]])
      .mockResolvedValueOnce([[{
        campaign_budget: "0",
        campaign_revenue: "100000",
        leads: "0",
        conversions: "0"
      }]]);

    const result = await reportService.monthly(9, 2026);
    expect(result.campaign.roi_percent).toBe(0);
  });
});