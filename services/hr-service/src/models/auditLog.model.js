const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  action: { type: DataTypes.STRING, allowNull: false },
  actorId: { type: DataTypes.INTEGER, allowNull: true },
  actorRole: { type: DataTypes.STRING, allowNull: true },
  targetType: { type: DataTypes.STRING, allowNull: false },
  targetId: { type: DataTypes.INTEGER, allowNull: true },
  details: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'audit_logs',
  indexes: [
    { fields: ['targetType', 'targetId'] },
  ],
});

module.exports = AuditLog;
