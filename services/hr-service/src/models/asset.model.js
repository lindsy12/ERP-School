const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Minimal asset/inventory tracking — satisfies the brief's HR-module scope
// (asset/inventory management) alongside the richer payroll/leave/attendance flows.
const Asset = sequelize.define('Asset', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  category: { type: DataTypes.STRING, allowNull: false },
  serialNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  status: {
    type: DataTypes.ENUM('available', 'assigned', 'maintenance', 'retired'),
    allowNull: false,
    defaultValue: 'available',
  },
  assignedTo: { type: DataTypes.INTEGER, allowNull: true }, // employeeId
  purchaseDate: { type: DataTypes.DATEONLY, allowNull: true },
  value: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
}, {
  tableName: 'assets',
  indexes: [
    { unique: true, fields: ['serialNumber'] },
    { fields: ['status'] },
  ],
});

module.exports = Asset;
