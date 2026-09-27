const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Payroll = sequelize.define('Payroll', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenantId: { type: DataTypes.STRING(36), allowNull: false },
  month: { type: DataTypes.INTEGER, allowNull: false }, // 1-12
  year: { type: DataTypes.INTEGER, allowNull: false },
  status: {
    type: DataTypes.ENUM('draft', 'paid'),
    allowNull: false,
    defaultValue: 'draft',
  },
  generatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  paidAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'payrolls',
  indexes: [
    { unique: true, fields: ['tenantId', 'month', 'year'] },
  ],
});

module.exports = Payroll;
