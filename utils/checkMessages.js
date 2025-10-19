const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'test-consumer',
  brokers: ['34.172.179.60:9094'],
});

const consumer = kafka.consumer({ groupId: 'check-' + Date.now() });

async function run() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'reservations.events', fromBeginning: true });
  console.log('📡 Leyendo mensajes del topic reservations.events...\n');

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      console.log(message.value.toString());
    },
  });

  // auto-timeout después de 10 segundos
  setTimeout(async () => {
    console.log('\n⏹️ Fin de lectura');
    await consumer.disconnect();
    process.exit(0);
  }, 10000);
}

run().catch(console.error);
