const db = require('../config/db');
const reservationsModel = jest.requireActual('../models/reservationsModel');

describe('reservationsModel', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createReservation', () => {
  test('debería insertar la reserva correctamente (1 asiento)', (done) => {
      const cb = (err, result) => {
        expect(err).toBeNull();
        expect(result).toEqual({
          success: true,
          message: 'All seats reserved successfully.',
          reservationId: 10,
          totalPrice: 200,
          seatsReserved: 1,
          currency: 'ARS',
          aircraftModel: 'B737-800-TEST'
        });
        done();
      };
      // 1) getFlightQuery -> validates flight exists and get aircraftModel + status
      db.query.mockImplementationOnce((sql, params, callback) => 
        callback(null, [{ aircraftModel: 'B737-800-TEST', flightStatus: 'ONTIME' }])
      );
      // 2) checkQuery -> check for existing pending reservations
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, []));
      // 3) availableQuery -> returns available seat with price
      db.query.mockImplementationOnce((sql, params, callback) =>
        callback(null, [{ seatId: 'A1', price: 200 }])
      );
      // 4) insertQuery -> creates reservation, returns insertId
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, { insertId: 10 }));
      // 5) reserveQuery -> reserve the seat
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, { affectedRows: 1 }));
      // 6) updateFlightQuery -> update counters
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, {}));
      // 7) getFlightQuery (again) -> get aircraftModel for response
      db.query.mockImplementationOnce((sql, params, callback) => 
        callback(null, [{ aircraftModel: 'B737-800-TEST' }])
      );
      // 8) insert payment event
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, {}));

      reservationsModel.createReservation('user1', 'FL123', ['A1'], 'ARS', cb);
    });

  test('debería fallar cuando el asiento no está disponible', (done) => {
      const cb = (err, result) => {
        expect(err).toBeNull();
        expect(result).toEqual({
          success: false,
          message: 'Seat(s) A1 are not available or do not exist.'
        });
        done();
      };

      // 1) getFlightQuery -> validates flight exists
      db.query.mockImplementationOnce((sql, params, callback) => 
        callback(null, [{ aircraftModel: 'B737-800-TEST', flightStatus: 'ONTIME' }])
      );
      // 2) checkQuery -> check for existing pending reservations
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, []));
      // 3) availableQuery -> no available seats
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, []));

      reservationsModel.createReservation('user1', 'FL123', ['A1'], 'ARS', cb);
    });
  });

  describe('cancelReservation', () => {
  test('debería cancelar una reserva pagada y liberar asientos', (done) => {
    const cb = (err, result) => {
      expect(err).toBeNull();
      expect(result).toEqual({
        success: true,
        message: 'Reservation cancelled and refund pending.',
        seatsCancelled: 1,
        note: 'Seats remain reserved, counters unchanged'
      });
      done();
    };

    // 1) SELECT reservation data
    db.query.mockImplementationOnce((sql, params, callback) => {
      callback(null, [{
        reservationId: 1,
        status: 'PAID',
        seatId: JSON.stringify(['A1']),
        externalFlightId: 'FL123',
        totalPrice: 200,
        externalUserId: 'user1',
        reservationDate: '2025-01-01T10:00:00Z'
      }]);
    });
    // 2) SELECT flight data for event
    db.query.mockImplementationOnce((sql, params, callback) => {
      callback(null, [{
        flightDate: '2025-12-01T10:00:00Z',
        aircraftModel: 'B737-800'
      }]);
    });
    // 3) UPDATE reservation status to PENDING_REFUND
    db.query.mockImplementationOnce((sql, params, callback) => callback(null, { affectedRows: 1 }));

    reservationsModel.cancelReservation(1, cb);
  });

  test('debería devolver no encontrada cuando la reserva no existe', (done) => {
      const cb = (err, result) => {
        expect(err).toBeNull();
        expect(result).toEqual({ success: false, message: 'Reservation does not exist.' });
        done();
      };

      db.query.mockImplementationOnce((sql, params, callback) => callback(null, []));
      reservationsModel.cancelReservation(999, cb);
    });
  });

  describe('changeSeat', () => {
  test('debería actualizar el asiento de la reserva', (done) => {
      const cb = (err, result) => {
        expect(err).toBeNull();
        expect(result).toEqual({ details: 'Cambio de asiento de A1 a B2' });
        done();
      };

      // update reservation
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, {}));
      // liberar asiento
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, {}));
      // reservar nuevo asiento
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, {}));

      reservationsModel.changeSeat(1, 'A1', 'B2', cb);
    });
  });

  describe('getReservationsByExternalUserId', () => {
  test('debería devolver reservas (mapeo asíncrono)', (done) => {
      const cb = (err, results) => {
        expect(err).toBeNull();
        expect(Array.isArray(results)).toBe(true);
        expect(results[0].reservationId).toBe(1);
        done();
      };

      // Return array of reservations with no seatId (to avoid db.promise seat query)
      db.query.mockImplementationOnce((sql, params, callback) =>
        callback(null, [
          {
            reservationId: 1,
            externalUserId: 'user1',
            externalFlightId: 'FL123',
            seatId: null,
            status: 'PAID',
            totalPrice: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            flightDate: null,
            aircraftModel: null,
            origin: null,
            destination: null,
            aircraft: null
          }
        ])
      );

      reservationsModel.getReservationsByExternalUserId('user1', cb);
    });
  });

  describe('getFullReservationsByExternalUserId', () => {
  test('debería devolver reservas completas con vuelo y asientos (usa db.promise)', (done) => {
      const cb = (err, results) => {
        expect(err).toBeNull();
        expect(results).toHaveLength(1);
        expect(results[0].reservationId).toBe(1);
        expect(results[0].seats).toHaveLength(1);
        done();
      };

      // 1) main reservations query - return ARRAY
      db.query.mockImplementationOnce((sql, params, callback) =>
        callback(null, [
          {
            reservationId: 1,
            externalUserId: 'user1',
            externalFlightId: 'FL123',
            seatId: JSON.stringify([1]),
            status: 'PAID',
            totalPrice: 200,
            createdAt: '2025-09-17',
            updatedAt: '2025-09-17',
            flightDate: '2025-10-01',
            aircraftModel: 'A320',
            origin: JSON.stringify({ code: 'JFK' }),
            destination: JSON.stringify({ code: 'LAX' }),
            aircraft: 'A320'
          }
        ])
      );

      // db.promise().query -> return seats
      db.promise = jest.fn(() => ({
        query: jest.fn().mockResolvedValue([[{ seatId: 1, seatNumber: 'A1', category: 'Economy', price: 200 }]])
      }));

      reservationsModel.getFullReservationsByExternalUserId('user1', cb);
    });
  });
});


