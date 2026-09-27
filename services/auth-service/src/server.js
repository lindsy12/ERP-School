// Entry point: starts the HTTP server. This is the only file that listens on a port.
const app = require('./app');
const config = require('./config/env');
const pool = require('./config/db');

const server = app.listen(config.port, () => {
  console.log(`auth-service listening on port ${config.port}`);
});

// `docker stop` sends SIGTERM — finish open requests and close DB connections cleanly.
function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
