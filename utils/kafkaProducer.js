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

  // Publicar evento de reserva creada
  async sendReservationCreatedEvent(reservationData) {
    // Validar campos obligatorios
    const requiredFields = ['reservationId','userId','flightId','amount','currency','reservedAt'];
    for (const field of requiredFields) {
      if (!(field in reservationData)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    // Construir el mensaje
    const message = {
      event_type: 'reservations.reservation.created',
      payload: {
        reservationId: reservationData.reservationId,
        userId: reservationData.userId,
        flightId: reservationData.flightId,
        amount: reservationData.amount,
        currency: reservationData.currency,
        reservedAt: reservationData.reservedAt
      },
      schema_version: '1.0'
    };
    // Publicar en el topic
    return this.sendMessage('reservations.events', message, reservationData.reservationId);
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