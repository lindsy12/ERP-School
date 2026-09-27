const { Op } = require('sequelize');
const Employee = require('../models/employee.model');

// Generates EMP<year>-<seq>, e.g. EMP2025-001, sequential per calendar year PER TENANT
// (matricule is unique per school, not system-wide — see employee.model.js).
async function generateMatricule(tenantId, date = new Date()) {
  const year = date.getFullYear();
  const count = await Employee.count({
    where: { tenantId, matricule: { [Op.like]: `EMP${year}-%` } },
  });
  const seq = String(count + 1).padStart(3, '0');
  return `EMP${year}-${seq}`;
}

module.exports = { generateMatricule };
