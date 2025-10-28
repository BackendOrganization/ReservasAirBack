jest.mock('kafkajs', () => {
  return {
    Kafka: jest.fn().mockImplementation((cfg) => ({ cfg }))
  };
});

describe('tests utils/kafka', () => {
  afterEach(() => {
    jest.resetModules();
    delete process.env.KAFKA_USERNAME;
    delete process.env.KAFKA_PASSWORD;
    delete process.env.KAFKA_BROKER;
  });

  test('debería construir Kafka con broker localhost por defecto', () => {
    const kafka = require('../utils/kafka');
    expect(kafka.cfg.brokers[0]).toBe('localhost:9092');
    expect(kafka.cfg.ssl).toBe(false);
  });

  test('debería construir Kafka con broker de entorno y SASL', () => {
    process.env.KAFKA_BROKER = 'example:9093';
    process.env.KAFKA_USERNAME = 'user';
    process.env.KAFKA_PASSWORD = 'pass';
    const kafka = require('../utils/kafka');
    expect(kafka.cfg.brokers[0]).toBe('example:9093');
    expect(kafka.cfg.sasl).toEqual({ mechanism: 'plain', username: 'user', password: 'pass' });
    expect(kafka.cfg.ssl).toBe(false);

  });
});
