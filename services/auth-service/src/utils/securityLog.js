// Security events (lockouts, token theft, admin actions) as one JSON line each, so the central
// log collector can filter on "event". Never put passwords or tokens in fields.
function securityLog(level, event, fields) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === 'warn') console.warn(line);
  else console.log(line);
}

module.exports = securityLog;
