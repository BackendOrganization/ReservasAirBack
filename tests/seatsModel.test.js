const db = require('../config/db');
const seatsModel = jest.requireActual('../models/seatsModel');

describe('seatsModel', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getReservedOrConfirmedSeats', () => {
    test('debería devolver datos de vuelo y asientos', (done) => {
      const cb = (err, result) => {
        expect(err).toBeNull();
        expect(result).toEqual({
          flightId: 'FL123',
          airCraftType: 'B737',
          occupiedSeats: ['2B'],
          reservedSeats: ['1A']
        });
        done();
      };

      // 1) flight query
      db.query
        .mockImplementationOnce((sql, params, callback) =>
          callback(null, [{ externalFlightId: 'FL123', aircraft: 'B737' }])
        )
        // 2) seats query
        .mockImplementationOnce((sql, params, callback) =>
          callback(null, [
            { seatId: '1A', status: 'RESERVED' },
            { seatId: '2B', status: 'CONFIRMED' }
          ])
        );

      seatsModel.getReservedOrConfirmedSeats('FL123', cb);
    });

  test('debería devolver error si falla la consulta de vuelo', (done) => {
      const cb = (err, result) => {
        try {
          expect(result).toBeUndefined();
          expect(err).toBeInstanceOf(Error);
          expect(err.message).toBe('DB Error');
          done();
        } catch (e) {
          done(e);
        }
      };

      // 1) Se hace una consulta a la db y se simula que hay un fallo
      db.query.mockImplementationOnce((sql, params, callback) => callback(new Error('DB Error')));

      seatsModel.getReservedOrConfirmedSeats('FL123', cb);
    });
  });

  describe('reserveSeat', () => {
    test('debería reservar el asiento correctamente', (done) => {
      const cb = (err, res) => {
        expect(err).toBeNull();
        expect(res).toEqual({ success: true, message: 'Seat reserved successfully.' });
        done();
      };

      db.query.mockImplementationOnce((sql, params, callback) => callback(null, { affectedRows: 1 }));
      seatsModel.reserveSeat('FL123', '1A', cb);
    });
  });

  describe('cancelSeat', () => {
    test('debería cancelar el asiento correctamente', (done) => {
      const cb = (err, res) => {
        expect(err).toBeNull();
        expect(res).toEqual({ success: true, message: 'Seat cancelled successfully.' });
        done();
      };

      db.query.mockImplementationOnce((sql, params, callback) => callback(null, { affectedRows: 1 }));
      seatsModel.cancelSeat('FL123', '1A', cb);
    });
  });

  describe('timeoutOrPaymentFailure', () => {
    test('debería liberar el asiento cuando falla el pago', (done) => {
      const cb = (err, res) => {
        expect(err).toBeNull();
        expect(res).toEqual({ success: true, message: 'Reservation failed, please try again.' });
        done();
      };

      db.query.mockImplementationOnce((sql, params, callback) => callback(null, { affectedRows: 1 }));
      seatsModel.timeoutOrPaymentFailure('FL123', '1A', cb);
    });
  });
});



