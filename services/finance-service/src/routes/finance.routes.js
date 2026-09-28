const express = require("express");
const controller = require("../controllers/finance.controller");

const router = express.Router();

router.post("/invoices", controller.createInvoice);
router.get("/invoices", controller.listInvoices);
router.get("/invoices/student/:studentId", controller.listStudentInvoices);
router.get("/invoices/:id", controller.getInvoice);

router.post("/payments", controller.createPayment);
router.get("/payments", controller.listPayments);
router.get("/invoices/:invoiceId/payments", controller.listPayments);
router.post("/payments/momo", controller.createMomoPayment);

router.post("/expenses", controller.createExpense);
router.get("/expenses", controller.listExpenses);

router.post("/campaigns", controller.createCampaign);
router.get("/campaigns", controller.listCampaigns);
router.patch("/campaigns/:id", controller.updateCampaign);

router.get("/reports/monthly", controller.monthlyReport);

module.exports = router;
