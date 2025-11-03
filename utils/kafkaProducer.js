const axios = require('axios');

// Configuración del broker externo
const BROKER_URL = 'http://34.172.179.60/events';
const API_KEY = 'microservices-api-key-2024-secure';

/**
 * Servicio para publicar eventos a través del broker HTTP externo
 * Este broker maneja la distribución de eventos a Kafka internamente
 */
class EventsProducerService {
  /**
   * Envía un evento HTTP al broker externo
   * @param {Object} message - Mensaje con estructura de evento
   * @returns {Promise<void>}
   */
  async sendEvent(message) {
    try {
      await axios.post(BROKER_URL, message, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        }
      });
      console.log(`📤 Event sent: ${message.eventType} (${message.messageId})`);
    } catch (error) {
      console.error('❌ Error sending event to broker:', error.message);
      throw error;
    }
  }

  /**
   * Publica evento de reserva creada
   * @param {Object} reservationData - Datos de la reserva
   */
  async sendReservationCreatedEvent(reservationData) {
    // Validar campos obligatorios
    const requiredFields = ['reservationId', 'userId', 'flightId', 'amount', 'currency', 'reservedAt'];
    for (const field of requiredFields) {
      if (!(field in reservationData)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Generar metadatos del evento
    const now = new Date().toISOString();
    const messageId = `msg-${Date.now()}`;
    const correlationId = `corr-${Date.now()}`;
    const idempotencyKey = `reservation-${reservationData.reservationId}-${Date.now()}`;

    // Construir mensaje - payload debe ser string JSON
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

    return this.sendEvent(message);
  }

  /**
   * Publica evento de reserva actualizada
   * @param {Object} reservationData - Datos de la reserva actualizada
   */
  async sendReservationUpdatedEvent(reservationData) {
    // Validar campos obligatorios
    const requiredFields = ['reservationId', 'newStatus', 'reservationDate', 'flightDate'];
    for (const field of requiredFields) {
      if (!(field in reservationData)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Generar metadatos del evento
    const now = new Date().toISOString();
    const messageId = `msg-${Date.now()}`;
    const correlationId = `corr-${Date.now()}`;
    const idempotencyKey = `reservation-updated-${reservationData.reservationId}-${Date.now()}`;

    // Construir mensaje - payload debe ser string JSON
    const message = {
      messageId,
      eventType: 'reservations.reservation.updated',
      schemaVersion: '1.0',
      occurredAt: now,
      producer: 'reservations-service',
      correlationId,
      idempotencyKey,
      payload: JSON.stringify({
        reservationId: String(reservationData.reservationId),
        newStatus: String(reservationData.newStatus),
        reservationDate: reservationData.reservationDate,
        flightDate: reservationData.flightDate
      })
    };

    return this.sendEvent(message);
  }

  // Alias para compatibilidad con código existente
  async sendReservationCreatedHttpEvent(reservationData) {
    return this.sendReservationCreatedEvent(reservationData);
  }

  async sendReservationUpdatedHttpEvent(reservationData) {
    return this.sendReservationUpdatedEvent(reservationData);
  }
}

module.exports = new EventsProducerService();