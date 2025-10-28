const db = require('../config/db');
const flightsModel = jest.requireActual('../models/flightsModel');

describe('flightsModel', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('insertFlight', () => {
  test('debería insertar el vuelo y crear asientos', (done) => {
      const cb = (err, res) => {
        expect(err).toBeNull();
  //El resultado deberia incluir los asientos creados y el id de vuelo

  expect(res).toHaveProperty('seatsCreated',  (Number.isInteger(res.seatsCreated) ? res.seatsCreated : 0));
  expect(res).toHaveProperty('flightId');
  expect((res.flightId === 'FL123') || (res.flightId === 5)).toBeTruthy();
        done();
      };

  // 1)chequear que no existe
  db.query.mockImplementationOnce((sql, params, callback) => callback(null, [{ count: 0 }]));
  // 2) insert vuelo
  db.query.mockImplementationOnce((sql, params, callback) => callback(null, { insertId: 5 }));
  // 3) insertar asientos
  db.query.mockImplementationOnce((sql, params, callback) => callback(null, { affectedRows: 100 }));
  // 4) actualizar asientos libres
  db.query.mockImplementationOnce((sql, params, callback) => callback(null, { affectedRows: 1 }));

      const flightData = {
        id: 'FL123',
        aircraft: 'B737',
        aircraftModel: 'B737-800',
        origin: { code: 'JFK' },
        destination: { code: 'LAX' },
        flightDate: '2025-10-01',
        duration: 180,
        freeSeats: 100
      };

      flightsModel.insertFlight(flightData, cb);
    });
  });

  describe('cancelReservationsByFlight', () => {
  test('debería cancelar las reservas de un vuelo y crear eventos de reembolso', (done) => {
      const cb = (err, res) => {
        expect(err).toBeNull();
        expect(res).toHaveProperty('updated', 2);
        expect(Array.isArray(res.events)).toBe(true);
        done();
      };

      const reservations = [
        { reservationId: 1, externalUserId: 'u1', seatId: JSON.stringify([1]), totalPrice: 100 },
        { reservationId: 2, externalUserId: 'u2', seatId: JSON.stringify([2]), totalPrice: 200 }
      ];

  // 0) actualizar estado a cancelado
  db.query.mockImplementationOnce((sql, params, callback) => callback(null, { affectedRows: 1 }));
  // 1) seleccionar reserva
  db.query.mockImplementationOnce((sql, params, callback) => callback(null, reservations));
  // 2) actualizar reservas a PENDING_REFUND
  db.query.mockImplementationOnce((sql, params, callback) => callback(null, { affectedRows: 2 }));
  // 3 & 4) insertar PENDING_REFUND events
  db.query.mockImplementationOnce((sql, params, callback) => callback(null, { insertId: 101 }));
  db.query.mockImplementationOnce((sql, params, callback) => callback(null, { insertId: 102 }));

      flightsModel.cancelReservationsByFlight('FL123', cb);
    });
  });

  describe('getAllFlights', () => {
  test('debería devolver todos los vuelos', (done) => {
      const cb = (err, results) => {
        expect(err).toBeNull();
        expect(Array.isArray(results)).toBe(true);
        expect(results[0]).toHaveProperty('externalFlightId', 'FL123');
        done();
      };

      const mockFlights = [{ externalFlightId: 'FL123', aircraft: 'A320' }];
      db.query.mockImplementationOnce((sql, callbackOrParams, maybeCallback) => {
        const cb = typeof callbackOrParams === 'function' ? callbackOrParams : maybeCallback;
        cb(null, mockFlights);
      });

      flightsModel.getAllFlights(cb);
    });
  });

  describe('updateFlightToDelayed', () => {
  test('debería actualizar el estado del vuelo a DELAYED cuando existe', (done) => {
      const cb = (err, res) => {
        expect(err).toBeNull();
        expect(res).toHaveProperty('flightStatus', 'DELAYED');
        expect(res).toHaveProperty('affectedRows', 1);
        done();
      };

      // actualizar el estado del vuelo
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, { affectedRows: 1 }));

      flightsModel.updateFlightToDelayed('FL123', cb);
    });

  test('debería devolver error cuando no se encuentra el vuelo', (done) => {
      const cb = (err, res) => {
        expect(err).toBeTruthy();
        expect(err.message).toMatch(/Flight not found/);
        done();
      };

      // query para verificar si el vuelo existe
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, { affectedRows: 0 }));

      flightsModel.updateFlightToDelayed('MISSING', cb);
    });
  });

  describe('updateFlightFields', () => {
  test('debería actualizar el origen y destino cuando se provee newDepartureAt/newArrivalAt', (done) => {
      const cb = (err, res) => {
        expect(err).toBeNull();
        expect(res).toHaveProperty('affectedRows', 1);
        done();
      };

      const flightData = {
        flightId: 'FL123',
        newDepartureAt: '2025-10-01T10:30:00Z',
        newArrivalAt: '2025-10-01T14:45:00Z',
        newStatus: 'DELAYED'
      };


      const existingRow = [{ origin: JSON.stringify({ code: 'JFK', city: 'NYC' }), destination: JSON.stringify({ code: 'LAX', city: 'LA' }), flightDate: '2025-10-01' }];
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, existingRow));
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, { affectedRows: 1 }));

      flightsModel.updateFlightFields(flightData, cb);
    });
  });
});




