jest.mock("../src/models/invoice.model");
jest.mock("../src/models/payment.model");

const invoiceModel = require("../src/models/invoice.model");
const paymentModel = require("../src/models/payment.model");
const paymentService = require("../src/services/payment.service");

describe("Payment service", () => {
  beforeEach(() => jest.clearAllMocks());

  test("rejects payment for missing invoice", async () => {
    invoiceModel.findById.mockResolvedValue(null);

    await expect(paymentService.create({
      invoiceId: 999,
      amount: 50000,
      method: "MOBILE_MONEY"
    })).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND"
    });
  });

  test("rejects payment that exceeds balance", async () => {
    invoiceModel.findById.mockResolvedValue({ id: 1, amount: 100000 });
    paymentModel.totalsForInvoice.mockResolvedValue(75000);

    await expect(paymentService.create({
      invoiceId: 1,
      amount: 50000,
      method: "CASH"
    })).rejects.toMatchObject({
      status: 400,
      code: "PAYMENT_EXCEEDS_BALANCE"
    });
  });

  test("records a partial payment and updates invoice status", async () => {
    invoiceModel.findById.mockResolvedValue({ id: 1, amount: 100000 });
    paymentModel.totalsForInvoice.mockResolvedValue(0);
    paymentModel.create.mockResolvedValue({ id: 10, invoice_id: 1, amount: 40000 });

    await expect(paymentService.create({
      invoiceId: 1,
      amount: 40000,
      method: "MOBILE_MONEY"
    })).resolves.toEqual({ id: 10, invoice_id: 1, amount: 40000 });

    expect(invoiceModel.updateStatus).toHaveBeenCalledWith(1, "PARTIALLY_PAID");
  });

  test("marks invoice as paid when balance is fully covered", async () => {
    invoiceModel.findById.mockResolvedValue({ id: 1, amount: 100000 });
    paymentModel.totalsForInvoice.mockResolvedValue(50000);
    paymentModel.create.mockResolvedValue({ id: 11, invoice_id: 1, amount: 50000 });

    await paymentService.create({
      invoiceId: 1,
      amount: 50000,
      method: "BANK_TRANSFER"
    });

    expect(invoiceModel.updateStatus).toHaveBeenCalledWith(1, "PAID");
  });

  test("lists payments", async () => {
    paymentModel.findAll.mockResolvedValue([{ id: 1 }]);

    await expect(paymentService.list(1)).resolves.toEqual([{ id: 1 }]);
    expect(paymentModel.findAll).toHaveBeenCalledWith({ invoiceId: 1 });
  });
});