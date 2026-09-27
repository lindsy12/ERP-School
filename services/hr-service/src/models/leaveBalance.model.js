const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { defaultAnnualLeaveDays } = require('../config/payrollConfig');

const LeaveBalance = sequelize.define('LeaveBalance', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  employeeId: { type: DataTypes.INTEGER, allowNull: false },
  year: { type: DataTypes.INTEGER, allowNull: false },
  annualTotal: { type: DataTypes.INTEGER, allowNull: false, defaultValue: defaultAnnualLeaveDays },
  annualUsed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  sickUsed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  maternityUsed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  paternityUsed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'leave_balances',
  indexes: [
    { unique: true, fields: ['employeeId', 'year'] },
  ],
});

module.exports = LeaveBalance;
