const pool = require("../db/connection");

async function create({ name, budget, startDate, endDate, leads, conversions, revenue }) {
  const [result] = await pool.query(
    `INSERT INTO campaigns
      (name, budget, start_date, end_date, leads, conversions, revenue, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
    [name, budget, startDate, endDate, leads, conversions, revenue]
  );
  const [rows] = await pool.query("SELECT * FROM campaigns WHERE id = ?", [result.insertId]);
  return rows[0];
}

async function findAll() {
  const [rows] = await pool.query("SELECT * FROM campaigns ORDER BY created_at DESC");
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query("SELECT * FROM campaigns WHERE id = ?", [id]);
  return rows[0] || null;
}

async function update(id, fields) {
  const allowed = ["name", "budget", "start_date", "end_date", "leads", "conversions", "revenue", "status"];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) { sets.push(`${key} = ?`); params.push(fields[key]); }
  }
  if (!sets.length) return findById(id);
  params.push(id);
  await pool.query(`UPDATE campaigns SET ${sets.join(", ")} WHERE id = ?`, params);
  return findById(id);
}

module.exports = { create, findAll, findById, update };
