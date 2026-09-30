// Entry point: starts the gateway. This is the only file that listens on a port.
const createApp = require('./app');
const config = require('./config/env');

const server = createApp().listen(config.port, () => {
  console.log(`gateway listening on port ${config.port}`);
});

// `docker stop` sends SIGTERM: stop accepting connections and let open requests finish.
function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
