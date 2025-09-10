
const amqp = require('amqplib');
let channel, connection;

async function connectRabbitMQ(retries = 5) {
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('RABBITMQ_URL no definida');

  for (let i = 0; i < retries; i++) {
    try {
      connection = await amqp.connect(url);
      channel = await connection.createChannel();
      console.log('✅ Conectado a RabbitMQ');
      return channel;
    } catch (err) {
      console.error(`Intento ${i + 1} fallido:`, err.message);
      await new Promise(res => setTimeout(res, 5000));
    }
  }
  throw new Error('No se pudo conectar a RabbitMQ después de varios intentos.');
}

function getChannel() {
  if (!channel) throw new Error('RabbitMQ no está conectado todavía.');
  return channel;
}

async function publishPaymentEvent(event) {
  const ch = getChannel();
  const queue = 'payment_events';
  await ch.assertQueue(queue, { durable: false });
  ch.sendToQueue(queue, Buffer.from(JSON.stringify(event)));
  console.log('📤 Evento publicado:', event);
}

async function consumePaymentEvents() {
  const ch = getChannel();
  const queue = 'payment_events';
  await ch.assertQueue(queue, { durable: false });

  ch.consume(queue, msg => {
    if (msg) {
      console.log('📥 Evento recibido:', msg.content.toString());
      ch.ack(msg);
    }
  });
}

module.exports = {
  connectRabbitMQ,
  getChannel,
  publishPaymentEvent,
  consumePaymentEvents
};
