const { Sequelize } = require('sequelize');

// Always MySQL — including in tests. We deliberately don't fall back to an
// in-memory SQLite dialect for `npm test`: it needs a native build (node-gyp +
// Python), which isn't reliably available on every teammate's machine, and
// SQLite's SQL semantics diverge from MySQL's in ways that can hide real bugs
// (e.g. ENUM/DECIMAL handling, GROUP BY strictness). Tests use `hr_db_test` by
// default so they never touch dev data; point DB_HOST/DB_PORT at a real MySQL
// instance (`docker compose up -d hr-db`, then map its port — see README).
const isTest = process.env.NODE_ENV === 'test';

const sequelize = new Sequelize(
  process.env.DB_NAME || (isTest ? 'hr_db_test' : 'hr_db'),
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    // Tests run from the host (locally or in CI), not inside the docker
    // network, so they default to localhost rather than the container hostname.
    host: process.env.DB_HOST || (isTest ? 'localhost' : 'hr-db'),
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  },
);

module.exports = sequelize;
