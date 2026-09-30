const sequelize = require('../config/database');
const Employee = require('./employee.model');
const Attendance = require('./attendance.model');
const Leave = require('./leave.model');
const LeaveBalance = require('./leaveBalance.model');
const Payroll = require('./payroll.model');
const PayrollItem = require('./payrollItem.model');
const Asset = require('./asset.model');
const AuditLog = require('./auditLog.model');

Employee.hasMany(Attendance, { foreignKey: 'employeeId' });
Attendance.belongsTo(Employee, { foreignKey: 'employeeId' });

Employee.hasMany(Leave, { foreignKey: 'employeeId' });
Leave.belongsTo(Employee, { foreignKey: 'employeeId' });

Employee.hasMany(LeaveBalance, { foreignKey: 'employeeId' });
LeaveBalance.belongsTo(Employee, { foreignKey: 'employeeId' });

Payroll.hasMany(PayrollItem, { foreignKey: 'payrollId', as: 'items' });
PayrollItem.belongsTo(Payroll, { foreignKey: 'payrollId' });
Employee.hasMany(PayrollItem, { foreignKey: 'employeeId' });
PayrollItem.belongsTo(Employee, { foreignKey: 'employeeId' });

Employee.hasMany(Asset, { foreignKey: 'assignedTo' });
Asset.belongsTo(Employee, { foreignKey: 'assignedTo', as: 'assignee' });

module.exports = {
  sequelize,
  Employee,
  Attendance,
  Leave,
  LeaveBalance,
  Payroll,
  PayrollItem,
  Asset,
  AuditLog,
};
