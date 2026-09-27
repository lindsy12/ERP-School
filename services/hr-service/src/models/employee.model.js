const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Employee = sequelize.define('Employee', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  // id of the matching account in auth-service (no FK: different database)
  userId: { type: DataTypes.INTEGER, allowNull: true, unique: true },
  matricule: { type: DataTypes.STRING, allowNull: false, unique: true },
  firstName: { type: DataTypes.STRING, allowNull: false },
  lastName: { type: DataTypes.STRING, allowNull: false },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
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
    { unique: true, fields: ['email'] },
    { unique: true, fields: ['matricule'] },
    { fields: ['department'] },
    { fields: ['status'] },
  ],
});

module.exports = Employee;
