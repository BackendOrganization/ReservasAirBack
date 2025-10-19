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

  // Métodos específicos para Payment Events
  async sendPaymentEvent(eventType, paymentData) {
    return this.sendMessage('payment-events', {
      eventType,
      paymentData,
      timestamp: new Date().toISOString(),
      metadata: {
        source: 'reservas-air-back',
        correlationId: `payment-${paymentData.reservationId}-${Date.now()}`
      }
    }, `payment-${paymentData.reservationId}`);
  }

  // Métodos específicos para Reservation Events
  async sendReservationEvent(eventType, reservationData) {
    return this.sendMessage('reservation-events', {
      eventType,
      reservationData,
      timestamp: new Date().toISOString(),
      metadata: {
        source: 'reservas-air-back',
        correlationId: `reservation-${reservationData.reservationId || 'new'}-${Date.now()}`
      }
    }, `reservation-${reservationData.reservationId || reservationData.externalUserId}`);
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