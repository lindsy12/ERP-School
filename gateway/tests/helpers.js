// Test helpers: tiny real HTTP servers standing in for the services behind the gateway.
const http = require('http');

// A fake service that replies with exactly what it received, so tests can check
// what the gateway forwarded. `delayMs` makes it slow, to test timeouts.
async function startEchoService(name, { delayMs = 0 } = {}) {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      setTimeout(() => {
        res.writeHead(req.url === '/health' ? 200 : 201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            service: name,
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      }, delayMs);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => closeServer(server) };
}

// A URL where nothing is listening, to simulate a service that is down.
async function deadServiceUrl() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await closeServer(server);
  return `http://127.0.0.1:${port}`;
}

function closeServer(server) {
  server.closeAllConnections?.();
  return new Promise((resolve) => server.close(resolve));
}

function registryEntry(name, baseUrl, prefix) {
  return { name, baseUrl, prefix, healthUrl: `${baseUrl}/health` };
}

module.exports = { startEchoService, deadServiceUrl, registryEntry };
