require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');
const rabbitmq = require('./config/rabbitmq');

const PORT = process.env.PORT || 4004;

// hr-db may still be initialising when this container starts (compose's
// depends_on only waits for the container, not for MySQL to accept connections).
async function waitForDatabase(attempts = 30, delayMs = 3000) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await sequelize.authenticate();
      return;
    } catch (err) {
      console.log(`[hr-service] waiting for database (${i}/${attempts}): ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('database never became reachable');
}

async function start() {
  await waitForDatabase();
  console.log('[hr-service] database connected');

  // sync() is fine for an exam-scope project; a production service would use
  // sequelize-cli migrations instead of auto-syncing the schema on boot.
  await sequelize.sync();
  console.log('[hr-service] models synced');

  await rabbitmq.connect();

  app.listen(PORT, () => console.log(`[hr-service] listening on port ${PORT}`));
}

start().catch((err) => {
  console.error('[hr-service] failed to start', err);
  process.exit(1);
});
