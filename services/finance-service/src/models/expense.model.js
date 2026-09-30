const pool = require("../db/connection");

async function create({ description, category, amount, expenseDate }) {
  const [result] = await pool.query(
    "INSERT INTO expenses (description, category, amount, expense_date) VALUES (?, ?, ?, ?)",
    [description, category, amount, expenseDate]
  );
  const [rows] = await pool.query("SELECT * FROM expenses WHERE id = ?", [result.insertId]);
  return rows[0];
}

async function findAll() {
  const [rows] = await pool.query("SELECT * FROM expenses ORDER BY expense_date DESC, id DESC");
  return rows;
}

module.exports = { create, findAll };
