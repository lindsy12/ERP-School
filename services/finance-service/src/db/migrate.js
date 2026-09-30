const fs = require("fs");
const path = require("path");
require("dotenv").config();
const pool = require("./connection");

async function main() {
  const dir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    console.log(`Running ${file}...`);
    await pool.query(sql);
  }
  console.log("Finance database migrations completed.");
  await pool.end();
}

main().catch(async (error) => {
  console.error("Migration failed:", error.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
