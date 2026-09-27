// Writes our standard error body: { "error": { "code": "...", "message": "..." } }
// Uses plain Node response methods so it also works inside the proxy's error callback.
function sendError(res, status, code, message) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: { code, message } }));
}

module.exports = sendError;
