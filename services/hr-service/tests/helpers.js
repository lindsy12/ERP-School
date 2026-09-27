const jwt = require('jsonwebtoken');
const { sequelize } = require('../src/models');

async function resetDb() {
  await sequelize.sync({ force: true });
}

function token(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET);
}

const adminToken = () => token({ id: 1, role: 'Admin' });
const staffToken = (employeeId) => token({ id: 2, role: 'Staff', employeeId });

module.exports = { resetDb, token, adminToken, staffToken };
