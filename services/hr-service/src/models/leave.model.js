const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Leave = sequelize.define('Leave', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenantId: { type: DataTypes.STRING(36), allowNull: false },
  employeeId: { type: DataTypes.INTEGER, allowNull: false },
  type: {
    type: DataTypes.ENUM('annual', 'sick', 'maternity', 'paternity'),
    allowNull: false,
  },
  startDate: { type: DataTypes.DATEONLY, allowNull: false },
  endDate: { type: DataTypes.DATEONLY, allowNull: false },
  days: { type: DataTypes.INTEGER, allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: true },
  attachmentUrl: { type: DataTypes.STRING, allowNull: true },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    allowNull: false,
    defaultValue: 'pending',
  },
  approvedBy: { type: DataTypes.STRING(36), allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  rejectionReason: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'leaves',
  indexes: [
    { fields: ['tenantId', 'employeeId'] },
    { fields: ['tenantId', 'status'] },
    { fields: ['tenantId', 'startDate', 'endDate'] },
  ],
});

module.exports = Leave;
