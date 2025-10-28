
// Mockea la conexión a la base de datos
jest.mock('./config/db.js', () => {
  // Retorna un objeto simulado (mock) para la base de datos
  return {
    query: jest.fn((sql, params, callback) => {
      if (typeof callback === 'function') {
        callback(null, []); // Simula una respuesta exitosa por defecto
      }
    }),
    connect: jest.fn((callback) => {
      // Simula que la conexión fue exitosa
      if (typeof callback === 'function') {
        callback(null);
      }
    }),
    end: jest.fn((callback) => {
      if (typeof callback === 'function') {
        callback(null);
      }
    })
  };
});

jest.mock('./models/flightsModel.js');
jest.mock('./models/paymentEventsModel.js');
jest.mock('./models/reservationsModel.js');
jest.mock('./models/seatsModel.js');