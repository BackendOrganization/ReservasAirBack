const KafkaConsumerService = require('./kafkaConsumer');

const initializeKafka = async (options = {}) => {
  const {
    topics = ['payment-events'],
    delayMs = 2000,
    enableGracefulShutdown = true
  } = options;

  const kafkaConsumer = new KafkaConsumerService();
  
  try {
    console.log('🔄 Initializing Kafka Consumer for Payment Events...');
    
    await kafkaConsumer.connect();
    
    // Suscribirse a los topics especificados
    await kafkaConsumer.subscribe(topics);
    
    // Configurar graceful shutdown si está habilitado
    if (enableGracefulShutdown) {
      kafkaConsumer.setupGracefulShutdown();
    }
    
    // Iniciar el consumer
    await kafkaConsumer.startListening();
    
    console.log(`✅ Kafka Consumer initialized and listening for topics: ${topics.join(', ')}`);
    
    return kafkaConsumer;
    
  } catch (error) {
    console.error('❌ Failed to initialize Kafka Consumer:', error);
    console.log('⚠️ Server will continue without Kafka (payment events via REST API only)');
    return null;
  }
};

// Función de conveniencia para inicializar solo payment events
const initializePaymentKafka = () => {
  return initializeKafka({
    topics: ['payment-events'],
    delayMs: 2000
  });
};

// Función de conveniencia para inicializar todos los topics
const initializeAllKafka = () => {
  return initializeKafka({
    topics: ['payment-events', 'reservation-events', 'flight-events'], // ✅ Solo agregar 'flight-events'
    delayMs: 2000
  });
};

module.exports = { 
  initializeKafka, 
  initializePaymentKafka, 
  initializeAllKafka 
};