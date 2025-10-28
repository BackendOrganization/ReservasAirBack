jest.mock('kafkajs', () => {
  const mockConsumer = { connect: jest.fn().mockResolvedValue(undefined) };
  const mockProducer = { connect: jest.fn().mockResolvedValue(undefined) };
  const Kafka = function() {
    return {
      consumer: jest.fn(() => mockConsumer),
      producer: jest.fn(() => mockProducer)
    };
  };
  return { Kafka };
});

const { getKafka, createConsumer, createProducer } = require('../utils/kafkaInitializer');

describe('test kafkaInitializer', () => {
  test('debería devolver un singleton', () => {
    const k1 = getKafka();
    const k2 = getKafka();
    expect(k1).toBe(k2);
  });

  test('debería conectar y devolver el consumer', async () => {
    const consumer = await createConsumer({ groupId: 'test-group' });
    expect(consumer).toBeDefined();
    expect(typeof consumer.connect).toBe('function');
  });

  test('debería conectar y devolver el producer', async () => {
    const producer = await createProducer();
    expect(producer).toBeDefined();
    expect(typeof producer.connect).toBe('function');
  });
});
