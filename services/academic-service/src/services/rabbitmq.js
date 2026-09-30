const amqp = require('amqplib');

// RabbitMQ publisher for the Academic Service.
//
// WHAT: exposes publishEvent(eventName, payload), which sends a JSON message to the
// "school-events" topic exchange with eventName as the routing key
// (e.g. "academic.student.enrolled"). Other services (Finance, Notifications) bind their
// own queues to the routing keys they care about. This service doesn't need to know who
// they are.
//
// WHY it never throws: RabbitMQ is a side channel. The database is the source of truth for
// an enrollment, so a broker outage must not fail the HTTP request or crash the process.
// If RabbitMQ is down, publishEvent logs a loud [rabbitmq] error that includes the event name
// and payload, so the missed event is visible and can be replayed by hand, and then returns
// false. The trade-off: an event can be lost while the broker is down. The robust fix later is
// the "transactional outbox" pattern: write events to a DB table in the same transaction as
// the enrollment, and have a background worker publish them.
//
// Connection strategy: connect lazily on first publish, reuse one connection and channel,
// and if the connection drops, forget it so the *next* publish tries to reconnect.
// No background retry loop, which keeps this easy to reason about.

const EXCHANGE = 'erp.events';

// If the broker host is unreachable, give up after this long instead of hanging the request.
const CONNECT_TIMEOUT_MS = 5000;

// The in-flight or completed connection attempt: a Promise resolving to a confirm channel,
// or null. Caching the *promise* (not the channel) means concurrent publishes during startup
// share one connection attempt instead of each opening their own.
let channelPromise = null;

// Turns any connection error into a readable string for the logs.
// Why: when a hostname resolves to several addresses (e.g. localhost -> ::1 and 127.0.0.1)
// and all are refused, Node throws an AggregateError whose .message is EMPTY. The useful
// details ("ECONNREFUSED 127.0.0.1:5672") live on its inner .errors.
function describeError(err) {
  if (err?.errors?.length) {
    return err.errors.map((e) => e.message || e.code).join('; ');
  }
  return err?.message || err?.code || String(err);
}

// Opens a connection plus a confirm channel, and declares the exchange.
// Why a *confirm* channel: RabbitMQ then acknowledges each message, so "published" in our
// logs means the broker actually has it, not just that it left our process.
async function openChannel() {
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('RABBITMQ_URL is not set');

  const connection = await amqp.connect(url, { timeout: CONNECT_TIMEOUT_MS });

  // An 'error' event with no listener crashes Node. These listeners are what stop a broker
  // restart from taking the whole service down.
  connection.on('error', (err) => {
    console.error('[rabbitmq] connection error:', describeError(err));
  });
  connection.on('close', () => {
    console.error('[rabbitmq] connection closed; will reconnect on next publish');
    channelPromise = null;
  });

  try {
    const channel = await connection.createConfirmChannel();
    channel.on('error', (err) => {
      console.error('[rabbitmq] channel error:', describeError(err));
    });
    channel.on('close', () => {
      channelPromise = null;
    });

    // assertExchange creates the exchange if it's missing and is a no-op if it already
    // exists with the same settings. durable: the exchange survives a broker restart.
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    console.log(`[rabbitmq] connected, exchange "${EXCHANGE}" ready`);
    return channel;
  } catch (err) {
    // Don't leak a half-open connection if channel setup failed.
    await connection.close().catch(() => {});
    throw err;
  }
}

// Returns the shared channel, opening one if needed. On failure it clears the cache so the
// next call retries, instead of every future publish reusing the same rejected promise.
function getChannel() {
  if (!channelPromise) {
    channelPromise = openChannel().catch((err) => {
      channelPromise = null;
      throw err;
    });
  }
  return channelPromise;
}

// Publishes one event. Returns true if RabbitMQ confirmed it, or false if it failed.
// It NEVER throws, so callers can `await` it without their own try/catch and a broker
// problem can't turn a successful DB write into a 500.
async function publishEvent(eventName, payload) {
  try {
    const channel = await getChannel();
    const body = Buffer.from(JSON.stringify(payload));
    channel.publish(EXCHANGE, eventName, body, {
      contentType: 'application/json',
      persistent: true, // written to disk by the broker so it survives a broker restart
      timestamp: Math.floor(Date.now() / 1000),
    });
    // Resolves once the broker has acknowledged the message, and rejects if it refused it.
    await channel.waitForConfirms();
    console.log(`[rabbitmq] published ${eventName}`);
    return true;
  } catch (err) {
    console.error(
      `[rabbitmq] FAILED to publish ${eventName}: ${describeError(err)}. ` +
        `The DB change was kept; this event was NOT delivered. Payload: ${JSON.stringify(payload)}`
    );
    return false;
  }
}

// Tries to connect at startup so a misconfigured RABBITMQ_URL shows up in the logs right
// away rather than on the first enrollment. Never throws; if it fails, publishEvent will
// simply try again later.
async function connect() {
  try {
    await getChannel();
  } catch (err) {
    console.error(
      `[rabbitmq] could not connect at startup (${describeError(err)}); ` +
        'service continues, will retry on next publish'
    );
  }
}

module.exports = {
  connect,
  publishEvent,
};

