const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'reservas-air-back',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  connectionTimeout: 3000,
  authenticationTimeout: 1000,
  reauthenticationThreshold: 10000,
  // Deshabilitar SSL para desarrollo local
  ssl: false,
  // Si usas autenticación SASL (común en producción)
  ...(process.env.KAFKA_USERNAME && {
    sasl: {
      mechanism: 'plain',
      username: process.env.KAFKA_USERNAME,
      password: process.env.KAFKA_PASSWORD
    }
  })
});

module.exports = kafka;