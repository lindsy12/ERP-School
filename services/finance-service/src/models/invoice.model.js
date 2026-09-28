const pool = require("../db/connection");

async function create({ studentId, academicYear, amount, dueDate, sourceEventId = null }) {
  const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const [result] = await pool.query(
    `INSERT INTO invoices
      (invoice_number, student_id, academic_year, amount, due_date, status, source_event_id)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
    [invoiceNumber, studentId, academicYear, amount, dueDate, sourceEventId]
  );
  return findById(result.insertId);
}

async function findById(id) {
  const [rows] = await pool.query("SELECT * FROM invoices WHERE id = ?", [id]);
  return rows[0] || null;
}

async function findAll({ studentId, status } = {}) {
  let sql = "SELECT * FROM invoices WHERE 1=1";
  const params = [];
  if (studentId) { sql += " AND student_id = ?"; params.push(studentId); }
  if (status) { sql += " AND status = ?"; params.push(status); }
  sql += " ORDER BY created_at DESC";
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function findByStudent(studentId) {
  return findAll({ studentId });
}

async function findBySourceEventId(sourceEventId) {
  const [rows] = await pool.query("SELECT * FROM invoices WHERE source_event_id = ?", [sourceEventId]);
  return rows[0] || null;
}

async function updateStatus(id, status) {
  await pool.query("UPDATE invoices SET status = ? WHERE id = ?", [status, id]);
  return findById(id);
}

module.exports = { create, findById, findAll, findByStudent, findBySourceEventId, updateStatus };
