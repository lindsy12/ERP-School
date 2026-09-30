require('dotenv').config();
const app = require('./app');
const pool = require('./db');
const applySchema = require('./db/applySchema');
const rabbitmq = require('./services/rabbitmq');

const PORT = process.env.PORT || 4002;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// academic-db may still be starting when this container does.
async function waitForDatabase(attempts = 30, delayMs = 3000) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`[academic-service] waiting for database (${i}/${attempts}): ${err.message}`);
      await wait(delayMs);
    }
  }
  throw new Error('database never became reachable');
}

async function start() {
  await waitForDatabase();
  await applySchema();
  console.log('[academic-service] schema ready');
  app.listen(PORT, () => {
    console.log(`Academic service running on port ${PORT}`);
    // Connect to RabbitMQ in the background so config problems show up in the logs right away.
    // It never throws, and the service stays up even if the broker is unreachable.
    rabbitmq.connect();
  });
}

start().catch((err) => {
  console.error('[academic-service] failed to start', err);
  process.exit(1);
});
