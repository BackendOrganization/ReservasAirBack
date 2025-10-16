const kafka = require('./kafka');
const paymentEventsModel = require('../models/paymentEventsModel');

const flightsModel = require('../models/flightsModel'); // ✅ NUEVO

class KafkaConsumerService {
  constructor() {
    this.consumer = kafka.consumer({ 
      groupId: 'reservas-air-group',
      sessionTimeout: 30000,
      rebalanceTimeout: 60000,
      heartbeatInterval: 3000,
      maxWaitTimeInMs: 5000,
      allowAutoTopicCreation: true  // ✅ Cambiar de false a true
    });
    this.isRunning = false;
  }

  async connect() {
    try {
      await this.consumer.connect();
      console.log('✅ Kafka Consumer connected successfully');
    } catch (error) {
      console.error('❌ Failed to connect Kafka Consumer:', error);
      throw error;
    }
  }

  async subscribe(topics) {
    try {
      for (const topic of topics) {
        await this.consumer.subscribe({ topic, fromBeginning: false });
        console.log(`📡 Subscribed to topic: ${topic}`);
      }
    } catch (error) {
      console.error('❌ Failed to subscribe to topics:', error);
      throw error;
    }
  }

  async startListening() {
    if (this.isRunning) {
      console.log('⚠️ Consumer is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting Kafka Consumer...');

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const messageValue = message.value.toString();
          const messageKey = message.key ? message.key.toString() : null;
          
          console.log(`📨 Received message from topic: ${topic}`);
          console.log(`📝 Message: ${messageValue}`);
          console.log(`🔑 Key: ${messageKey}`);

          // Parse del mensaje JSON
          let parsedMessage;
          try {
            parsedMessage = JSON.parse(messageValue);
          } catch (parseError) {
            console.error('❌ Failed to parse message JSON:', parseError);
            return; // Skip mensaje malformado
          }

          // Rutear el mensaje según el topic
          await this.routeMessage(topic, parsedMessage, messageKey);

        } catch (error) {
          console.error('❌ Error processing message:', error);
        }
      },
    });
  }

  // === TOPIC ROUTING ===
  async routeMessage(topic, message, messageKey) {
    switch (topic) {
      case 'payment-events':
        // === PAYMENT EVENTS SEGMENT ===
        await this.handlePaymentEvent(message);
        break;
      case 'flight-events':
        // === FLIGHT EVENTS SEGMENT ===
        await this.handleFlightEvent(message);
        break;
      default:
        console.log(`⚠️ Unknown topic: ${topic}`);
    }
  }

  // === PAYMENT EVENTS SEGMENT ===
  async handlePaymentEvent(message) {
    console.log('💳 Processing payment event:', message);
    const { eventType, paymentData, metadata } = message;
    switch (eventType) {
      case 'PAYMENT_SUCCESS':
        await this.processPaymentSuccess(paymentData);
        break;
      case 'PAYMENT_FAILED':
      case 'PAYMENT_TIMEOUT':
        await this.processPaymentFailed(paymentData);
        break;
      case 'PAYMENT_CANCELLED':
        await this.processPaymentCancelled(paymentData);
        break;
      case 'PAYMENT_REFUND':
        await this.processPaymentRefund(paymentData);
        break;
      default:
        console.log(`⚠️ Unknown payment event type: ${eventType}`);
    }
  }

  async processPaymentCancelled(paymentData) {
    return new Promise((resolve, reject) => {
      paymentEventsModel.cancelPayment(
        paymentData.reservationId,
        paymentData.externalUserId,
        (err, result) => {
          if (err) {
            console.error('❌ Error processing payment cancelled via Kafka:', err);
            reject(err);
          } else {
            console.log('🟡 Payment cancelled processed via Kafka');
            console.log('Result:', result);
            resolve(result);
          }
        }
      );
    });
  }



  // === FLIGHT EVENTS SEGMENT ===
  async handleFlightEvent(message) {
    console.log('✈️ Processing flight event:', message);
    
    // ✅ NUEVO: Verificar si el vuelo está siendo cancelado
    const { flightId, newStatus } = message;
    
    if (newStatus && newStatus.toUpperCase() === 'CANCELLED') {
      console.log(`❌ Flight ${flightId} is being cancelled - processing cancellations`);
      await this.processCancelledFlight(flightId);
      return; // Salir después de procesar la cancelación
    }
    
    // Si el mensaje tiene todos los campos requeridos para creación, ingesta
    const requiredFields = [
      'flightId', 'flightNumber', 'origin', 'destination', 'aircraftModel',
      'departureAt', 'arrivalAt', 'status', 'price', 'currency'
    ];
    const isCreate = requiredFields.every(f => message.hasOwnProperty(f));
    if (isCreate) {
      // Adaptar el body al esperado por el controller
      // Parsear origin y destination correctamente
      const parseLocation = (code, dateStr) => {
        // Puedes mapear el código a ciudad si tienes un diccionario, aquí solo ejemplo simple
        const cityMap = { EZE: 'Buenos Aires', MDZ: 'Mendoza' };
        const date = new Date(dateStr);
        const hh = String(date.getUTCHours()).padStart(2, '0');
        const min = String(date.getUTCMinutes()).padStart(2, '0');
        return {
          city: cityMap[code] || code,
          code,
          time: `${hh}:${min}`
        };
      };
      // Calcular duración en minutos
      let duration = null;
      try {
        const dep = new Date(message.departureAt);
        const arr = new Date(message.arrivalAt);
        if (!isNaN(dep) && !isNaN(arr)) {
          const totalMinutes = Math.round((arr - dep) / 60000);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          duration = `${hours}h ${minutes.toString().padStart(2, '0')}m`;
        }
      } catch (e) { duration = null; }
      const flightData = {
        id: message.flightId,
        flightNumber: message.flightNumber,
        origin: parseLocation(message.origin, message.departureAt),
        destination: parseLocation(message.destination, message.arrivalAt),
        aircraft: message.aircraftModel,
        aircraftModel: message.aircraftModel,
        flightDate: message.departureAt.split('T')[0],
        duration
      };
      // Llamar al controller directamente
      const flightsController = require('../controllers/flightsController');
      // Simular req/res para el controller
      const req = { body: flightData };
      const res = {
        status: (code) => ({ json: (obj) => console.log(`[IngestFlight][${code}]`, obj) }),
        json: (obj) => console.log('[IngestFlight][json]', obj)
      };
      flightsController.ingestFlight(req, res);
      return;
    }
    // Si no es creación, actualizar campos
    if (!flightId) {
      console.error('❌ Missing required field: flightId');
      return;
    }
    await this.processFlightUpdate(message);
  }

  // ✅ NUEVA: Función para procesar vuelos cancelados
  async processCancelledFlight(flightId) {
    return new Promise((resolve, reject) => {
      console.log(`❌ Processing flight cancellation for flight: ${flightId}`);
      
      const flightsController = require('../controllers/flightsController');
      
      // Simular req/res para el controller
      const req = { 
        params: { externalFlightId: flightId }
      };
      const res = {
        status: (code) => ({
          json: (obj) => {
            console.log(`[CancelFlight][${code}]`, obj);
            if (code >= 200 && code < 300) {
              resolve(obj);
            } else {
              reject(new Error(`Cancel flight failed with status ${code}: ${JSON.stringify(obj)}`));
            }
          }
        }),
        json: (obj) => {
          console.log('[CancelFlight][success]', obj);
          resolve(obj);
        }
      };
      
      // Llamar al controller para cancelar todas las reservas del vuelo
      flightsController.cancelFlightReservations(req, res);
    });
  }

  async processFlightUpdate(flightData) {
    return new Promise((resolve, reject) => {
      flightsModel.updateFlightFields(flightData, (err, result) => {
        if (err) {
          console.error('❌ Error updating flight via Kafka:', err);
          reject(err);
        } else {
          console.log('✅ Flight updated successfully via Kafka');
          console.log('Result:', result);
          resolve(result);
        }
      });
    });
  }

  // === PAYMENT EVENT HANDLERS ===
  
  async processPaymentSuccess(paymentData) {
    return new Promise((resolve, reject) => {
      paymentEventsModel.confirmPayment(
        'SUCCESS', 
        paymentData.reservationId, 
        paymentData.externalUserId, 
        (err, result) => {
          if (err) {
            console.error('❌ Error confirming payment via Kafka:', err);
            reject(err);
          } else {
            console.log('✅ Payment confirmed successfully via Kafka');
            console.log('Result:', result);
            resolve(result);
          }
        }
      );
    });
  }

  async processPaymentFailed(paymentData) {
    return new Promise((resolve, reject) => {
      const failedPaymentData = {
        paymentStatus: 'FAILED',
        reservationId: paymentData.reservationId,
        externalUserId: paymentData.externalUserId,
        amount: paymentData.amount
      };
      
      paymentEventsModel.createPaymentEventAndFailReservation(
        failedPaymentData,
        (err, result) => {
          if (err) {
            console.error('❌ Error processing failed payment via Kafka:', err);
            reject(err);
          } else {
            console.log('✅ Failed payment processed successfully via Kafka');
            console.log('Result:', result);
            resolve(result);
          }
        }
      );
    });
  }

  async processPaymentRefund(paymentData) {
    return new Promise((resolve, reject) => {
      paymentEventsModel.cancelPayment(
        paymentData.reservationId,
        paymentData.externalUserId,
        (err, result) => {
          if (err) {
            console.error('❌ Error processing refund via Kafka:', err);
            reject(err);
          } else {
            console.log('✅ Refund processed successfully via Kafka');
            console.log('Result:', result);
            resolve(result);
          }
        }
      );
    });
  }



  async disconnect() {
    try {
      this.isRunning = false;
      await this.consumer.disconnect();
      console.log('✅ Kafka Consumer disconnected successfully');
    } catch (error) {
      console.error('❌ Error disconnecting Kafka Consumer:', error);
    }
  }

  setupGracefulShutdown() {
    const signals = ['SIGTERM', 'SIGINT'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        console.log(`📡 Received ${signal}, shutting down Kafka Consumer gracefully...`);
        await this.disconnect();
        process.exit(0);
      });
    });
  }
}

module.exports = KafkaConsumerService;