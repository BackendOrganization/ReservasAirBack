const axios = require('axios');

async function sendReservationCreatedHttpEvent(reservationData) {
  const now = new Date().toISOString();
  const messageId = `msg-${Date.now()}`;
  const correlationId = `corr-${Date.now()}`;
  const idempotencyKey = `reservation-${reservationData.reservationId}-${Date.now()}`;
  const message = {
    messageId,
    eventType: 'reservations.reservation.created',
    schemaVersion: '1.0',
    occurredAt: now,
    producer: 'reservations-service',
    correlationId,
    idempotencyKey,
    payload: JSON.stringify({
      reservationId: String(reservationData.reservationId),
      userId: String(reservationData.userId),
      flightId: String(reservationData.flightId),
      amount: Number(reservationData.amount),
      currency: reservationData.currency,
      reservedAt: reservationData.reservedAt
    })
  };

  await axios.post('http://34.172.179.60/events', message, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'microservices-api-key-2024-secure'
    }
  });
}

async function sendReservationUpdatedHttpEvent(reservationData) {
  const now = new Date().toISOString();
  const messageId = `msg-${Date.now()}`;
  const correlationId = `corr-${Date.now()}`;
  const idempotencyKey = `reservation-updated-${reservationData.reservationId}-${Date.now()}`;
  const message = {
    messageId,
    eventType: 'reservations.reservation.updated',
    schemaVersion: '1.0',
    occurredAt: now,
    producer: 'reservations-service',
    correlationId,
    idempotencyKey,
    payload: JSON.stringify(reservationData)
  };

  await axios.post('http://34.172.179.60/events', message, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'microservices-api-key-2024-secure'
    }
  });
}
const { createProducer } = require('./kafkaInitializer');

class KafkaProducerService {
  constructor() {
    this.producer = null;
    this.isConnected = false;
  }

  async connect() {
    if (!this.isConnected) {
      this.producer = await createProducer();
      this.isConnected = true;
      console.log('✅ Kafka Producer connected');
    }
  }

  async sendMessage(topic, message, key = null) {
    try {
      await this.connect();
      const result = await this.producer.send({
        topic,
        messages: [{
          key: key,
          value: JSON.stringify(message),
          timestamp: Date.now().toString()
        }]
      });
      console.log(`📤 Message sent to ${topic}:`, result);
      return result;
    } catch (error) {
      console.error('❌ Error sending message to Kafka:', error);
      throw error;
    }
  }

  async sendReservationCreatedEvent(reservationData) {
    // Validar campos obligatorios
    const requiredFields = ['reservationId','userId','flightId','amount','currency','reservedAt'];
    for (const field of requiredFields) {
      if (!(field in reservationData)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    // Generar metadatos
    const now = new Date().toISOString();
    const messageId = `msg-${Date.now()}`;
    const correlationId = `corr-${Date.now()}`;
    const idempotencyKey = `reservation-${reservationData.reservationId}-${Date.now()}`;
    // Construir el mensaje con payload serializado
    const message = {
      messageId,
      eventType: 'reservations.reservation.created',
      schemaVersion: '1.0',
      occurredAt: now,
      producer: 'reservations-service',
      correlationId,
      idempotencyKey,
      payload: JSON.stringify({
        reservationId: String(reservationData.reservationId),
        userId: String(reservationData.userId),
        flightId: String(reservationData.flightId),
        amount: Number(reservationData.amount),
        currency: reservationData.currency,
        reservedAt: reservationData.reservedAt
      })
    };
    // Publicar en el topic correcto
    return this.sendMessage('reservations.events', message, reservationData.reservationId);
  }

  async sendReservationCreatedEvent(reservationData) {
    const requiredFields = ['reservationId','userId','flightId','amount','currency','reservedAt'];
    for (const field of requiredFields) {
      if (!(field in reservationData)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    const now = new Date().toISOString();
    const messageId = `msg-${Date.now()}`;
    const correlationId = `corr-${Date.now()}`;
    const idempotencyKey = `reservation-${reservationData.reservationId}-${Date.now()}`;
    const message = {
      messageId,
      eventType: 'reservations.reservation.created',
      schemaVersion: '1.0',
      occurredAt: now,
      producer: 'reservations-service',
      correlationId,
      idempotencyKey,
      payload: JSON.stringify({
        reservationId: String(reservationData.reservationId),
        userId: String(reservationData.userId),
        flightId: String(reservationData.flightId),
        amount: Number(reservationData.amount),
        currency: reservationData.currency,
        reservedAt: reservationData.reservedAt
      })
    };
    return this.sendMessage('reservations.events', message, reservationData.reservationId);
  }

  async sendReservationUpdatedEvent(reservationData) {
    if (!reservationData.reservationId) {
      throw new Error('Missing required field: reservationId');
    }
    const now = new Date().toISOString();
    const messageId = `msg-${Date.now()}`;
    const correlationId = `corr-${Date.now()}`;
    const idempotencyKey = `reservation-updated-${reservationData.reservationId}-${Date.now()}`;
    const message = {
      messageId,
      eventType: 'reservations.reservation.updated',
      schemaVersion: '1.0',
      occurredAt: now,
      producer: 'reservations-service',
      correlationId,
      idempotencyKey,
      payload: JSON.stringify(reservationData)
    };
    return this.sendMessage('reservations.events', message, reservationData.reservationId);
  }

  async sendReservationCreatedHttpEvent(reservationData) {
    return sendReservationCreatedHttpEvent(reservationData);
  }

  async sendReservationUpdatedHttpEvent(reservationData) {
    return sendReservationUpdatedHttpEvent(reservationData);
  }

  async disconnect() {
    if (this.isConnected && this.producer) {
      await this.producer.disconnect();
      this.isConnected = false;
      console.log('✅ Kafka Producer disconnected');
    }
  }
}

module.exports = new KafkaProducerService();