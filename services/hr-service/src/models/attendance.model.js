const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Attendance = sequelize.define('Attendance', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenantId: { type: DataTypes.STRING(36), allowNull: false },
  employeeId: { type: DataTypes.INTEGER, allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  checkInTime: { type: DataTypes.DATE, allowNull: true },
  checkOutTime: { type: DataTypes.DATE, allowNull: true },
  durationMinutes: { type: DataTypes.INTEGER, allowNull: true },
  location: { type: DataTypes.STRING, allowNull: true },
  status: {
    type: DataTypes.ENUM('present', 'late', 'absent', 'leave'),
    allowNull: false,
    defaultValue: 'present',
  },
}, {
  tableName: 'attendances',
  indexes: [
    { unique: true, fields: ['employeeId', 'date'] },
    { fields: ['tenantId', 'date'] },
  ],
});

module.exports = Attendance;
