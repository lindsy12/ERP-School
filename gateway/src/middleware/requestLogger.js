// Logs every request as ONE JSON line once the response is finished, e.g.
// {"time":"...","requestId":"...","method":"POST","path":"/api/v1/auth/login","status":200,"durationMs":42}
// One JSON object per line is easy to search and to load into log tools later.
function defaultWrite(line) {
  process.stdout.write(`${line}\n`);
}

function requestLogger({ write = defaultWrite } = {}) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    let logged = false;

    const log = () => {
      if (logged) return;
      logged = true;
      const entry = {
        time: new Date().toISOString(),
        requestId: req.id,
        method: req.method,
        path: req.originalUrl.split('?')[0], // no query string: it can contain tokens or personal data
        status: res.statusCode,
        durationMs: Math.round(Number(process.hrtime.bigint() - start) / 1e6),
      };
      // Filled in once the gateway verifies JWTs and sets req.user.
      if (req.user?.id) entry.userId = req.user.id;
      write(JSON.stringify(entry));
    };

    res.on('finish', log); // response fully sent
    res.on('close', log); // client disconnected early
    next();
  };
}

module.exports = requestLogger;
