jest.mock("../src/models/invoice.model");
jest.mock("../src/models/payment.model");

const invoiceModel = require("../src/models/invoice.model");
const paymentModel = require("../src/models/payment.model");
const invoiceService = require("../src/services/invoice.service");

describe("Invoice service", () => {
  beforeEach(() => jest.clearAllMocks());

  test("creates an invoice", async () => {
    const data = { studentId: 3, academicYear: "2026/2027", amount: 250000, dueDate: "2026-11-30" };
    const invoice = { id: 2, student_id: 3, amount: 250000 };
    invoiceModel.create.mockResolvedValue(invoice);

    await expect(invoiceService.create(data)).resolves.toEqual(invoice);
    expect(invoiceModel.create).toHaveBeenCalledWith(data);
  });

  test("gets an invoice with balance", async () => {
    const invoice = { id: 2, amount: 250000, status: "PENDING" };
    invoiceModel.findById.mockResolvedValue(invoice);
    paymentModel.totalsForInvoice.mockResolvedValue(100000);

    await expect(invoiceService.get(2)).resolves.toEqual({
      ...invoice,
      total_paid: 100000,
      balance: 150000
    });
  });

  test("throws when invoice does not exist", async () => {
    invoiceModel.findById.mockResolvedValue(null);

    await expect(invoiceService.get(999)).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND"
    });
  });

  test("lists invoices", async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    invoiceModel.findAll.mockResolvedValue(rows);

    await expect(invoiceService.list({ studentId: 3 })).resolves.toEqual(rows);
    expect(invoiceModel.findAll).toHaveBeenCalledWith({ studentId: 3 });
  });
});