const kafka = require('./kafka');
const paymentEventsModel = require('../models/paymentEventsModel');
const reservationsModel = require('../models/reservationsModel');

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

  async routeMessage(topic, message, messageKey) {
    switch (topic) {
      case 'payment-events':
        await this.handlePaymentEvent(message);
        break;
      
      case 'reservation-events':
        await this.handleReservationEvent(message);
        break;
      
      default:
        console.log(`⚠️ Unknown topic: ${topic}`);
    }
  }

  async handlePaymentEvent(message) {
    console.log('💳 Processing payment event:', message);
    
    const { eventType, paymentData, metadata } = message;
    
    switch (eventType) {
      case 'PAYMENT_SUCCESS':
        await this.processPaymentSuccess(paymentData);
        break;
      case 'PAYMENT_FAILED':
      case 'PAYMENT_TIMEOUT': // Ahora los timeouts se tratan como fallidos
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

  async handleReservationEvent(message) {
    console.log('🎫 Processing reservation event:', message);
    
    const { eventType, reservationData, metadata } = message;
    
    switch (eventType) {
      case 'RESERVATION_EXPIRED':
        await this.processReservationExpiration(reservationData);
        break;
      
      case 'RESERVATION_REMINDER':
        await this.processReservationReminder(reservationData);
        break;
      
      default:
        console.log(`⚠️ Unknown reservation event type: ${eventType}`);
    }
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


  // === RESERVATION EVENT HANDLERS ===
  
  async processReservationExpiration(reservationData) {
    return new Promise((resolve, reject) => {
      reservationsModel.cancelReservation(
        reservationData.reservationId,
        (err, result) => {
          if (err) {
            console.error('❌ Error expiring reservation via Kafka:', err);
            reject(err);
          } else {
            console.log('✅ Reservation expired successfully via Kafka');
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