const express = require('express');
const controller = require('../controllers/employee.controller');
const validate = require('../middleware/validate');
const { authenticate, requireRole, HR_MANAGER_ROLES } = require('../middleware/auth');
const { createEmployeeSchema, updateEmployeeSchema, listEmployeesQuerySchema } = require('../validators/employee.validator');

const router = express.Router();

router.get('/me', authenticate, controller.getMe);

router.use(authenticate, requireRole(...HR_MANAGER_ROLES));

router.post('/', validate(createEmployeeSchema), controller.createEmployee);
router.get('/', validate(listEmployeesQuerySchema, 'query'), controller.listEmployees);
router.get('/:id', controller.getEmployee);
router.put('/:id', validate(updateEmployeeSchema), controller.updateEmployee);
router.delete('/:id', controller.deactivateEmployee);

module.exports = router;
