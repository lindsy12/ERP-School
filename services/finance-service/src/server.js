require("dotenv").config();

const app = require("./app");
const pool = require("./db/connection");
const { runMigrations } = require("./db/migrate");
const { startConsumer, onConnectionClosed } = require("./services/rabbitmq.service");

const PORT = process.env.PORT || 4003;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// finance-db may still be starting when this container does.
async function waitForDatabase(attempts = 30, delayMs = 3000) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      console.log(`[finance-service] waiting for database (${i}/${attempts}): ${err.message}`);
      await wait(delayMs);
    }
  }
  throw new Error("database never became reachable");
}

// The consumer creates tuition invoices from academic.student.enrolled; keep trying until the broker is up.
async function startConsumerWithRetry(delayMs = 5000) {
  for (;;) {
    try {
      await startConsumer();
      console.log("[finance-service] listening for academic.student.enrolled");
      return;
    } catch (err) {
      console.warn(`[finance-service] RabbitMQ consumer not started (${err.message}), retrying in ${delayMs / 1000}s`);
      await wait(delayMs);
    }
  }
}

async function start() {
  await waitForDatabase();
  await runMigrations({ log: (line) => console.log(`[finance-service] ${line}`) });
  app.listen(PORT, () => console.log(`Finance service running on port ${PORT}`));
  startConsumerWithRetry();
  onConnectionClosed(() => {
    console.warn("[finance-service] RabbitMQ connection lost, resubscribing");
    startConsumerWithRetry();
  });
}

start().catch((err) => {
  console.error("[finance-service] failed to start", err);
  process.exit(1);
});
