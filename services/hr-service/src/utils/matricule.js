const { Op } = require('sequelize');
const Employee = require('../models/employee.model');

// Generates EMP<year>-<seq>, e.g. EMP2025-001, sequential per calendar year.
async function generateMatricule(date = new Date()) {
  const year = date.getFullYear();
  const count = await Employee.count({
    where: { matricule: { [Op.like]: `EMP${year}-%` } },
  });
  const seq = String(count + 1).padStart(3, '0');
  return `EMP${year}-${seq}`;
}

module.exports = { generateMatricule };
