const dayjs = require('dayjs');
const { Op } = require('sequelize');
const { Attendance, Employee, Leave } = require('../models');
const { generateQr, verifyQr } = require('../services/qr.service');
const { lateCutoff } = require('../config/payrollConfig');
const { HR_MANAGER_ROLES } = require('../middleware/auth');

async function getEmployeeQr(req, res, next) {
  try {
    const employee = await Employee.findByPk(req.params.employeeId);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const { image, qrData } = await generateQr(employee.id);
    return res.json({ employeeId: employee.id, image, qrData });
  } catch (err) {
    return next(err);
  }
}

async function checkIn(req, res, next) {
  try {
    const { qrData, location } = req.body;
    const result = verifyQr(qrData);
    if (!result.valid) return res.status(400).json({ error: result.reason });

    const employee = await Employee.findByPk(result.employeeId);
    if (!employee || employee.status !== 'active') {
      return res.status(404).json({ error: 'Employee not found or inactive' });
    }

    const today = dayjs().format('YYYY-MM-DD');
    const existing = await Attendance.findOne({ where: { employeeId: employee.id, date: today } });
    if (existing) {
      return res.status(409).json({ error: `Already checked in today at ${dayjs(existing.checkInTime).format('HH:mm')}` });
    }

    const now = dayjs();
    const [cutoffH, cutoffM] = lateCutoff.split(':').map(Number);
    const isLate = now.hour() > cutoffH || (now.hour() === cutoffH && now.minute() > cutoffM);

    const attendance = await Attendance.create({
      employeeId: employee.id,
      date: today,
      checkInTime: now.toDate(),
      location: location || null,
      status: isLate ? 'late' : 'present',
    });

    return res.status(201).json({ message: `Checked in successfully at ${now.format('HH:mm')}`, attendance });
  } catch (err) {
    return next(err);
  }
}

async function checkOut(req, res, next) {
  try {
    // Only managers may act for someone else; everyone else is pinned to their own record.
    const isManager = HR_MANAGER_ROLES.includes(req.user.role);
    const employeeId = isManager ? (req.body.employeeId || req.user.employeeId) : req.user.employeeId;
    if (!employeeId) return res.status(400).json({ error: 'No employee record linked to your account' });

    const today = dayjs().format('YYYY-MM-DD');
    const attendance = await Attendance.findOne({ where: { employeeId, date: today } });
    if (!attendance || !attendance.checkInTime) {
      return res.status(400).json({ error: 'You must check in before checking out' });
    }
    if (attendance.checkOutTime) {
      return res.status(409).json({ error: 'Already checked out today' });
    }

    const now = dayjs();
    const durationMinutes = now.diff(dayjs(attendance.checkInTime), 'minute');
    await attendance.update({ checkOutTime: now.toDate(), durationMinutes });

    return res.json({ message: `Checked out successfully at ${now.format('HH:mm')}`, attendance });
  } catch (err) {
    return next(err);
  }
}

async function myAttendance(req, res, next) {
  try {
    const employeeId = req.params.employeeId || req.user.employeeId;
    const month = Number(req.query.month) || dayjs().month() + 1;
    const year = Number(req.query.year) || dayjs().year();

    const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
    const end = start.endOf('month');

    const [records, leaves] = await Promise.all([
      Attendance.findAll({
        where: { employeeId, date: { [Op.between]: [start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')] } },
      }),
      Leave.findAll({
        where: {
          employeeId,
          status: 'approved',
          startDate: { [Op.lte]: end.format('YYYY-MM-DD') },
          endDate: { [Op.gte]: start.format('YYYY-MM-DD') },
        },
      }),
    ]);

    const byDate = {};
    records.forEach((r) => { byDate[r.date] = r.status; });
    leaves.forEach((leave) => {
      let d = dayjs(leave.startDate);
      const leaveEnd = dayjs(leave.endDate);
      while (d.isBefore(leaveEnd) || d.isSame(leaveEnd, 'day')) {
        const key = d.format('YYYY-MM-DD');
        if (!byDate[key] && (d.isSame(start, 'month'))) byDate[key] = 'leave';
        d = d.add(1, 'day');
      }
    });

    const today = dayjs();
    const calendar = [];
    for (let d = start; d.isBefore(end) || d.isSame(end, 'day'); d = d.add(1, 'day')) {
      const key = d.format('YYYY-MM-DD');
      const dow = d.day();
      let status = byDate[key];
      if (!status) {
        if (dow === 0 || dow === 6) status = 'weekend';
        else if (d.isBefore(today, 'day')) status = 'absent';
        else status = 'upcoming';
      }
      calendar.push({ date: key, status });
    }

    return res.json({ employeeId: Number(employeeId), month, year, calendar });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getEmployeeQr, checkIn, checkOut, myAttendance };
