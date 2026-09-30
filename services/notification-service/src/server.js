require('dotenv').config();
const app = require('./app');
const pool = require('./db/connection');
const { runMigrations } = require('./db/migrate');
const consumer = require('./services/consumer');

const PORT = process.env.PORT || 4005;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// notification-db may still be starting when this container does.
async function waitForDatabase(attempts = 30, delayMs = 3000) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`[notification-service] waiting for database (${i}/${attempts}): ${err.message}`);
      await wait(delayMs);
    }
  }
  throw new Error('database never became reachable');
}

async function start() {
  await waitForDatabase();
  await runMigrations({ log: (line) => console.log(`[notification-service] ${line}`) });
  app.listen(PORT, () => console.log(`[notification-service] listening on port ${PORT}`));
  consumer.start();
}

start().catch((err) => {
  console.error('[notification-service] failed to start', err);
  process.exit(1);
});
