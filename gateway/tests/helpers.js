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

function registryEntry(name, baseUrl, prefix, uiPrefix, { inlineScripts = false } = {}) {
  return { name, baseUrl, prefix, uiPrefix, inlineScripts, healthUrl: `${baseUrl}/health` };
}

// A fake auth-service /api/v1/auth/verify. `users` maps a token to the identity it belongs to;
// any other token gets auth-service's 401. `mode` makes it misbehave: 'slow', 'error500', 'garbage'.
const TEST_USERS = {
  'good-token': { id: 'user-123', role: 'STAFF', tenant_id: 'tenant-abc' },
  'admin-token': { id: 'admin-1', role: 'ADMIN', tenant_id: 'tenant-abc' },
};

async function startFakeAuth({ users = TEST_USERS, mode } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push({ url: req.url, headers: req.headers });
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    if (mode === 'slow') return setTimeout(() => reply(200, users['good-token']), 1000);
    if (mode === 'error500') return reply(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } });
    if (mode === 'garbage') return reply(200, 'not json');

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token === 'expired-token') {
      return reply(401, { error: { code: 'TOKEN_EXPIRED', message: 'Access token has expired' } });
    }
    return users[token]
      ? reply(200, users[token])
      : reply(401, { error: { code: 'INVALID_TOKEN', message: 'Access token is invalid' } });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    verifyUrl: `http://127.0.0.1:${server.address().port}/api/v1/auth/verify`,
    calls,
    close: () => closeServer(server),
  };
}

module.exports = { startEchoService, deadServiceUrl, registryEntry, startFakeAuth, TEST_USERS };
