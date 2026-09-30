// A small GET helper for the gateway's own calls to services (health checks, token verification).
// Resolves with { status, body } or rejects with an error whose .code is TIMEOUT, ECONNREFUSED,
// ENOTFOUND, etc. The timeout covers the whole call, DNS lookup included.
const http = require('http');
const { serviceAgent } = require('./serviceAgent');

const MAX_BODY_BYTES = 64 * 1024; // these answers are tiny; refuse anything unexpectedly large

function httpGet(url, { headers = {}, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { agent: serviceAgent, headers }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          req.destroy(Object.assign(new Error('response too large'), { code: 'RESPONSE_TOO_LARGE' }));
        } else {
          chunks.push(chunk);
        }
      });
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    const timer = setTimeout(() => {
      req.destroy(Object.assign(new Error('timeout'), { code: 'TIMEOUT' }));
    }, timeoutMs);
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

module.exports = httpGet;
