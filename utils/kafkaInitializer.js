
const { Kafka } = require('kafkajs');

const kafkaConfig = {
  clientId: 'reservas-air-back',
  brokers: ['34.172.179.60:9094'],
};

let kafkaInstance = null;
function getKafka() {
  if (!kafkaInstance) {
    kafkaInstance = new Kafka(kafkaConfig);
  }
  return kafkaInstance;
}

async function createConsumer({ groupId = 'reservas-air-back-group' } = {}) {
  const kafka = getKafka();
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  return consumer;
}

async function createProducer() {
  const kafka = getKafka();
  const producer = kafka.producer();
  await producer.connect();
  return producer;
}

module.exports = {
  createConsumer,
  createProducer,
  getKafka,
};