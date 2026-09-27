const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PayrollItem = sequelize.define('PayrollItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  payrollId: { type: DataTypes.INTEGER, allowNull: false },
  employeeId: { type: DataTypes.INTEGER, allowNull: false },
  baseSalary: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  bonus: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  deductions: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  cnpsEmployee: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  taxable: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  paye: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  net: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
}, {
  tableName: 'payroll_items',
  indexes: [
    { unique: true, fields: ['payrollId', 'employeeId'] },
    { fields: ['employeeId'] },
  ],
});

module.exports = PayrollItem;
