const crypto = require('crypto');
const QRCode = require('qrcode');
const dayjs = require('dayjs');

const SECRET = process.env.QR_SECRET || process.env.JWT_SECRET || 'changeme';

function sign(employeeId, dateStr) {
  return crypto.createHmac('sha256', SECRET).update(`${employeeId}:${dateStr}`).digest('hex');
}

// Payload format: "<employeeId>:<YYYY-MM-DD>:<hmacSignature>"
// Regenerating it daily means a stolen photo of the badge is only useful for
// one day, and check-in rejects anything older than 24h regardless.
async function generateQr(employeeId) {
  const dateStr = dayjs().format('YYYY-MM-DD');
  const signature = sign(employeeId, dateStr);
  const qrData = `${employeeId}:${dateStr}:${signature}`;
  const image = await QRCode.toDataURL(qrData);
  return { qrData, image };
}

function verifyQr(qrData) {
  if (typeof qrData !== 'string' || qrData.split(':').length !== 3) {
    return { valid: false, reason: 'Malformed QR payload' };
  }
  const [employeeId, dateStr, signature] = qrData.split(':');
  const expected = sign(employeeId, dateStr);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  const validSig = sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  if (!validSig) return { valid: false, reason: 'Invalid QR signature' };

  const issuedAt = dayjs(dateStr, 'YYYY-MM-DD');
  const hoursSince = dayjs().diff(issuedAt, 'hour');
  if (!issuedAt.isValid() || hoursSince > 24) {
    return { valid: false, reason: 'QR code expired' };
  }
  return { valid: true, employeeId: Number(employeeId), dateStr };
}

module.exports = { generateQr, verifyQr };
