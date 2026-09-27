const dayjs = require('dayjs');
const { Op, fn, col } = require('sequelize');
const { Employee, Attendance, Leave } = require('../models');

async function getStats(req, res, next) {
  try {
    const { tenantId } = req.user;
    const today = dayjs().format('YYYY-MM-DD');

    const [totalActive, todayRecords, onLeaveToday, departmentCounts] = await Promise.all([
      Employee.count({ where: { tenantId, status: 'active' } }),
      Attendance.findAll({ where: { tenantId, date: today } }),
      Leave.count({
        where: { tenantId, status: 'approved', startDate: { [Op.lte]: today }, endDate: { [Op.gte]: today } },
      }),
      Employee.findAll({
        where: { tenantId, status: 'active' },
        attributes: ['department', [fn('COUNT', col('id')), 'count']],
        group: ['department'],
      }),
    ]);

    const presentToday = todayRecords.filter((r) => r.status === 'present').length;
    const lateToday = todayRecords.filter((r) => r.status === 'late').length;

    const trendDays = Array.from({ length: 7 }).map((_, i) => dayjs().subtract(6 - i, 'day').format('YYYY-MM-DD'));
    const trendRecords = await Attendance.findAll({ where: { tenantId, date: { [Op.in]: trendDays } } });
    const attendanceTrend = trendDays.map((date) => ({
      date,
      present: trendRecords.filter((r) => r.date === date && (r.status === 'present' || r.status === 'late')).length,
    }));

    return res.json({
      cards: {
        totalActiveEmployees: totalActive,
        presentToday: presentToday + lateToday,
        onLeaveToday,
        lateArrivalsToday: lateToday,
      },
      charts: {
        employeesPerDepartment: departmentCounts.map((d) => ({ department: d.department, count: Number(d.get('count')) })),
        attendanceToday: {
          present: presentToday,
          late: lateToday,
          onLeave: onLeaveToday,
          absent: Math.max(totalActive - presentToday - lateToday - onLeaveToday, 0),
        },
        attendanceTrend,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getStats };
