// Adaptación: inicialización directa del consumidor KafkaJS externo
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'reservas-air-back',
  brokers: ['34.172.179.60:9094'],
});

async function initializeKafka({ topic = 'flights.events', groupId = 'reservas-air-back-group' } = {}) {
  const consumer = kafka.consumer({ groupId });
  try {
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const key = message.key?.toString() || '';
        const value = message.value?.toString() || '';
        console.log(`[${topic}] ${key} -> ${value}`);
        // Aquí puedes agregar lógica para procesar el evento recibido
      },
    });
    console.log(`✅ Kafka Consumer initialized and listening for topic: ${topic}`);
    return consumer;
  } catch (error) {
    console.error('❌ Failed to initialize Kafka Consumer:', error);
    return null;
  }
}

module.exports = { initializeKafka };