const express = require('express');
const appealController = require('../controllers/appealController');

// Router for grade appeals, mounted at /api/v1/academic in app.js (same approach as atRiskRoutes).
// WHY full paths from /api/v1/academic: filing an appeal is nested under a grade
// (/grades/:gradeId/appeals), while managing appeals is top-level (/appeals/...). Nesting under
// gradeRoutes would mean editing that file, which is frozen.
// A request like POST /api/v1/academic/grades/5/appeals isn't matched by gradeRoutes (mounted earlier),
// so Express passes it on to this router.
const router = express.Router();

router.post('/grades/:gradeId/appeals', appealController.createAppeal);
router.get('/appeals', appealController.listAppeals);
router.get('/appeals/:id', appealController.getAppeal);
router.put('/appeals/:id/status', appealController.updateAppealStatus);

module.exports = router;
