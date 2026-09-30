const amqp = require('amqplib');
const notificationModel = require('../models/notification.model');
const { buildNotification, EVENT_TYPES } = require('./eventMessages');

// Listens on the shared "erp.events" topic exchange and stores one notification per event.
// Reconnects on its own when the broker restarts, so it never takes the HTTP API down.
const EXCHANGE = 'erp.events';
const QUEUE = 'notification-service';
const RECONNECT_MS = 5000;

async function handle(message) {
  const body = JSON.parse(message.content.toString());
  const notification = buildNotification(message.fields.routingKey, body);
  if (notification) await notificationModel.create(notification);
}

async function start() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672');
    connection.on('error', (err) => console.error('[rabbitmq] connection error:', err.message));
    connection.on('close', () => {
      console.warn(`[rabbitmq] connection closed, reconnecting in ${RECONNECT_MS / 1000}s`);
      setTimeout(start, RECONNECT_MS);
    });
    const channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await channel.assertQueue(QUEUE, { durable: true });
    for (const eventType of EVENT_TYPES) await channel.bindQueue(QUEUE, EXCHANGE, eventType);
    await channel.consume(QUEUE, async (message) => {
      if (!message) return;
      try {
        await handle(message);
        channel.ack(message);
      } catch (err) {
        // A malformed message would fail forever: log it and drop it instead of requeueing.
        console.error(`[rabbitmq] could not store ${message.fields.routingKey}:`, err.message);
        channel.nack(message, false, false);
      }
    });
    console.log(`[rabbitmq] consuming ${EVENT_TYPES.length} event types from "${EXCHANGE}"`);
  } catch (err) {
    console.error(`[rabbitmq] could not connect (${err.message}), retrying in ${RECONNECT_MS / 1000}s`);
    setTimeout(start, RECONNECT_MS);
  }
}

module.exports = { start, handle };
