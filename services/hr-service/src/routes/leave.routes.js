const express = require('express');
const controller = require('../controllers/leave.controller');
const validate = require('../middleware/validate');
const { authenticate, requireRole, requireSelfOrManager, HR_MANAGER_ROLES } = require('../middleware/auth');
const { requestLeaveSchema, rejectLeaveSchema, approveLeaveSchema } = require('../validators/leave.validator');

const router = express.Router();

router.use(authenticate);

router.post('/', validate(requestLeaveSchema), controller.requestLeave);
router.get('/my', controller.myLeaves);
router.get('/', requireRole(...HR_MANAGER_ROLES), controller.listLeaves);
router.get('/calendar', requireRole(...HR_MANAGER_ROLES), controller.leaveCalendar);
router.get('/balance/:employeeId', requireSelfOrManager('employeeId'), controller.getBalance);
router.put('/:id/approve', requireRole(...HR_MANAGER_ROLES), validate(approveLeaveSchema), controller.approveLeave);
router.put('/:id/reject', requireRole(...HR_MANAGER_ROLES), validate(rejectLeaveSchema), controller.rejectLeave);

module.exports = router;
