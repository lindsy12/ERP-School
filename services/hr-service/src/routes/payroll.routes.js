const express = require('express');
const controller = require('../controllers/payroll.controller');
const validate = require('../middleware/validate');
const { authenticate, requireRole, HR_MANAGER_ROLES } = require('../middleware/auth');
const { generatePayrollSchema, editPayrollItemSchema } = require('../validators/payroll.validator');

const router = express.Router();

router.use(authenticate);

router.post('/generate', requireRole(...HR_MANAGER_ROLES), validate(generatePayrollSchema), controller.generatePayroll);
router.get('/my', controller.myPayslips);
router.get('/', requireRole(...HR_MANAGER_ROLES), controller.getPayroll);
router.put('/item/:itemId', requireRole(...HR_MANAGER_ROLES), validate(editPayrollItemSchema), controller.updatePayrollItem);
router.put('/:id/pay', requireRole(...HR_MANAGER_ROLES), controller.payPayroll);
// Self/manager access is checked inside the controller, since the param here
// is the PayrollItem id, not the employeeId — requireSelfOrManager compares
// the wrong field for this route.
router.get('/payslip/:itemId', controller.getPayslip);

module.exports = router;
