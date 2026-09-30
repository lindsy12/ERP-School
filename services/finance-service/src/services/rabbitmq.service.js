const amqp = require("amqplib");
const invoiceModel = require("../models/invoice.model");

let channel;

async function connectRabbitMQ() {
  if (channel) return channel;
  const url = process.env.RABBITMQ_URL || "amqp://localhost:5672";
  const connection = await amqp.connect(url);
  channel = await connection.createChannel();
  await channel.assertExchange("erp.events", "topic", { durable: true });
  return channel;
}

async function publish(eventName, payload) {
  const ch = await connectRabbitMQ();
  ch.publish("erp.events", eventName, Buffer.from(JSON.stringify(payload)), {
    persistent: true,
    contentType: "application/json"
  });
}

async function startConsumer() {
  const ch = await connectRabbitMQ();
  const queue = "finance-service";
  await ch.assertQueue(queue, { durable: true });
  await ch.bindQueue(queue, "erp.events", "academic.student.enrolled");
  await ch.consume(queue, async (message) => {
    if (!message) return;
    try {
      const payload = JSON.parse(message.content.toString());
      const sourceEventId = payload.eventId || null;
      if (sourceEventId && await invoiceModel.findBySourceEventId(sourceEventId)) {
        ch.ack(message);
        return;
      }
      const invoice = await invoiceModel.create({
        studentId: payload.studentId,
        academicYear: payload.academicYear || new Date().getFullYear().toString(),
        amount: payload.amount,
        dueDate: payload.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0,10),
        sourceEventId
      });
      await publish("finance.invoice.created", {
        eventId: `invoice-${invoice.id}-${Date.now()}`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        studentId: invoice.student_id,
        amount: invoice.amount
      });
      ch.ack(message);
    } catch (error) {
      console.error("Finance RabbitMQ consumer error:", error.message);
      ch.nack(message, false, false);
    }
  });
}

module.exports = { connectRabbitMQ, publish, startConsumer };
