const pool = require("../db/connection");

async function create({ invoiceId, amount, method, transactionRef, phoneNumber }) {
  const [result] = await pool.query(
    `INSERT INTO payments (invoice_id, amount, method, transaction_ref, phone_number, status)
     VALUES (?, ?, ?, ?, ?, 'COMPLETED')`,
    [invoiceId, amount, method, transactionRef, phoneNumber]
  );
  const [rows] = await pool.query("SELECT * FROM payments WHERE id = ?", [result.insertId]);
  return rows[0];
}

async function findAll({ invoiceId } = {}) {
  let sql = "SELECT * FROM payments WHERE 1=1";
  const params = [];
  if (invoiceId) { sql += " AND invoice_id = ?"; params.push(invoiceId); }
  sql += " ORDER BY paid_at DESC";
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function totalsForInvoice(invoiceId) {
  const [rows] = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE invoice_id = ? AND status = 'COMPLETED'",
    [invoiceId]
  );
  return Number(rows[0].total_paid || 0);
}

module.exports = { create, findAll, totalsForInvoice };
