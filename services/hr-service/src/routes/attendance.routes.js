const express = require('express');
const controller = require('../controllers/attendance.controller');
const validate = require('../middleware/validate');
const { authenticate, requireSelfOrManager } = require('../middleware/auth');
const { checkinSchema, checkoutSchema } = require('../validators/attendance.validator');

const router = express.Router();

router.use(authenticate);

router.get('/qr/:employeeId', requireSelfOrManager('employeeId'), controller.getEmployeeQr);
router.post('/checkin', validate(checkinSchema), controller.checkIn);
router.post('/checkout', validate(checkoutSchema), controller.checkOut);
router.get('/my', controller.myAttendance);
router.get('/my/:employeeId', requireSelfOrManager('employeeId'), controller.myAttendance);

module.exports = router;
