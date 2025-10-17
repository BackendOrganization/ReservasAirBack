const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'reservas-air-back',
  brokers: ['34.172.179.60:9094'],
});

const topics = [
  'flights.events',
  'reservations.events',
  'payments.events',
  'users.events',
  'search.events',
  'metrics.events',
  'core.ingress',
];

async function runKafkaConsumer() {
  const consumer = kafka.consumer({ groupId: 'reservas-air-back-group' });
  await consumer.connect();
  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: true });
    console.log(`📡 Subscribed to topic: ${topic}`);
  }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const key = message.key?.toString() || '';
      const value = message.value?.toString() || '';
      console.log(`[${topic}] ${key} -> ${value}`);
      // Procesa cada topic según su tipo
      try {
        const parsed = JSON.parse(value);
        switch (topic) {
          case 'flights.events':
            // Procesar evento de vuelo
            // TODO: Lógica de negocio para vuelos
            break;
          case 'reservations.events':
            // Procesar evento de reserva
            // TODO: Lógica de negocio para reservas
            break;
          case 'payments.events':
            // Procesar evento de pago
            // TODO: Lógica de negocio para pagos
            break;
          // Agrega más cases según los topics que necesites
          default:
            // Otros topics
            break;
        }
      } catch (e) {
        // Si no es JSON válido, solo loguea
      }
    },
  });

  console.log('✅ Conectado y escuchando todos los topics en el broker externo. (Ctrl+C para salir)');
}

runKafkaConsumer().catch(e => {
  console.error('❌ Error en Kafka:', e);
  process.exit(1);
});