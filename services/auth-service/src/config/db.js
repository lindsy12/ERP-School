// A pool of MySQL connections shared by the whole service.
// Connections are opened lazily, on the first query — not when this file is loaded.
const mysql = require('mysql2/promise');
const { db } = require('./env');

const pool = mysql.createPool({
  host: db.host,
  port: db.port,
  user: db.user,
  password: db.password,
  database: db.database,
  connectionLimit: 10,
});

module.exports = pool;
