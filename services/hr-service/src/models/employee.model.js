const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Employee = sequelize.define('Employee', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  // the school this employee belongs to (auth-service's users.tenant_id, a UUID) — every
  // query in this multi-tenant system must be scoped by this, see middleware/auth.js
  tenantId: { type: DataTypes.STRING(36), allowNull: false },
  // id of the matching account in auth-service (UUID, users.id) — no FK: different database
  userId: { type: DataTypes.STRING(36), allowNull: true },
  matricule: { type: DataTypes.STRING, allowNull: false },
  firstName: { type: DataTypes.STRING, allowNull: false },
  lastName: { type: DataTypes.STRING, allowNull: false },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { isEmail: true },
  },
  phone: { type: DataTypes.STRING, allowNull: true },
  department: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, allowNull: false },
  hireDate: { type: DataTypes.DATEONLY, allowNull: false },
  baseSalary: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: false,
    defaultValue: 'active',
  },
}, {
  tableName: 'employees',
  indexes: [
    // Unique PER TENANT, not globally — two schools may each have their own EMP2026-001
    // or reuse a common email locally; only auth-service's users table is globally unique.
    { unique: true, fields: ['tenantId', 'email'] },
    { unique: true, fields: ['tenantId', 'matricule'] },
    { unique: true, fields: ['tenantId', 'userId'] },
    { fields: ['tenantId', 'department'] },
    { fields: ['tenantId', 'status'] },
  ],
});

module.exports = Employee;
