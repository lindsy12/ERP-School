const amqp = require('amqplib');

let channel = null;
let reconnectTimer = null;
const EXCHANGE = 'erp.events';
const RECONNECT_MS = 5000;

// Broker may come up after this service (or restart later) — keep retrying in
// the background instead of staying a permanent no-op.
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, RECONNECT_MS);
}

async function connect() {
  if (process.env.NODE_ENV === 'test') return null;
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672');
    channel = await conn.createChannel();
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    conn.on('error', (err) => console.error('[rabbitmq] connection error', err.message));
    conn.on('close', () => { console.warn('[rabbitmq] connection closed'); channel = null; scheduleReconnect(); });
    console.log('[rabbitmq] connected');
    return channel;
  } catch (err) {
    console.error('[rabbitmq] failed to connect, retrying in 5s:', err.message);
    channel = null;
    scheduleReconnect();
    return null;
  }
}

// Publishes a fire-and-forget event. Never throws — a broker outage must not
// take down the HR API (e.g. leave approval should still succeed).
function publish(eventName, payload) {
  if (!channel) {
    console.warn(`[rabbitmq] skipped publish "${eventName}" (no channel)`, payload);
    return false;
  }
  try {
    channel.publish(EXCHANGE, eventName, Buffer.from(JSON.stringify({
      event: eventName,
      emittedAt: new Date().toISOString(),
      data: payload,
    })), { persistent: true });
    return true;
  } catch (err) {
    console.error(`[rabbitmq] publish failed for "${eventName}"`, err.message);
    return false;
  }
}

module.exports = { connect, publish, EXCHANGE };
