const db = require('../config/db');
const paymentEventsModel = jest.requireActual('../models/paymentEventsModel');

describe.skip('paymentEventsModel', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('confirmPayment', () => {
  test('debería confirmar el pago (camino feliz completo)', (done) => {
      const cb = (err, res) => {
        expect(err).toBeNull();
        expect(res).toEqual({
          success: true,
          message: 'Payment confirmed, reservation PAID, seats CONFIRMED, payment event created.'
        });
        done();
      };
      

      db.query.mockImplementationOnce((sql, params, callback) => callback(null, []));

      db.query.mockImplementationOnce((sql, params, callback) => callback(null, [{ amount: 200 }]));

      // Mock pool connection
      const mockConn = {
        beginTransaction: jest.fn(fn => fn(null)),
        query: jest
          .fn()
          //  insert query
          .mockImplementationOnce((sql, params, cb) => cb(null, { insertId: 1 }))
          //  update reservation query
          .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 1 }))
          //  devuelve reservation con seatId JSON + flight id
          .mockImplementationOnce((sql, params, cb) => cb(null, [{ seatId: JSON.stringify([1]), externalFlightId: 'FL123' }]))
          //  confirm Seat sQuery
          .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 1 })),
        commit: jest.fn(cb => cb(null)),
        rollback: jest.fn(cb => cb && cb()),
        release: jest.fn()
      };
      db.getConnection = jest.fn(cb => cb(null, mockConn));

      paymentEventsModel.confirmPayment('SUCCESS', 1, 'user1', cb);
    });

  test('debería devolver error si no hay evento pendiente', () => {
      const cb = jest.fn();
      //no success
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, []));
      
      //db.query.mockImplementationOnce((sql, params, callback) => callback(null, []));

      paymentEventsModel.confirmPayment('SUCCESS', 1, 'user1', cb);

      expect(cb).toHaveBeenCalledWith(null, { success: false, message: 'No pending payment event found.' });
    });
  });

  describe('cancelPayment', () => {
  test('debería cancelar el pago dentro de una transacción (camino feliz)', (done) => {
      // Mock  connection 
      const mockConn = {
        beginTransaction: jest.fn(cb => cb(null)),
        query: jest
          .fn()
          // 1) findReservationQuery (FOR UPDATE)
          .mockImplementationOnce((sql, params, cb) => cb(null, [{ reservationId: 1, status: 'PENDING', seatId: JSON.stringify([1]), externalFlightId: 'FL123', totalPrice: 200 }]))
          // 2) checkRefundQuery
          .mockImplementationOnce((sql, params, cb) => cb(null, []))
          // 3) cancelQuery
          .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 1 }))
          // 4) getReservationQuery
          .mockImplementationOnce((sql, params, cb) => cb(null, [{ seatId: JSON.stringify([1]), externalFlightId: 'FL123', totalPrice: 200 }]))
          // 5) refundEvent insert
          .mockImplementationOnce((sql, params, cb) => cb(null, { insertId: 99 }))
          // 6) release seats
          .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 1 }))
          // 7) update flights counters
          .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 1 })),
        commit: jest.fn(cb => cb(null)),
        rollback: jest.fn(cb => cb && cb()),
        release: jest.fn()
      };
      db.getConnection = jest.fn(cb => cb(null, mockConn));

      const cb = (err, res) => {
        expect(err).toBeNull();
        expect(res).toEqual({
          success: true,
          message: 'Reservation cancelled, seats released, refund event created.'
        });
        done();
      };

      paymentEventsModel.cancelPayment(1, 'user1', cb);
    });
  });

  describe('createPaymentEventAndFailReservation', () => {
  test('debería insertar el evento y marcar la reserva como FAILED', () => {
      const cb = jest.fn();
      const paymentData = { reservationId: 1, externalUserId: 'user1', paymentStatus: 'FAILED' };

      const mockConn = {
        beginTransaction: jest.fn(cb => cb(null)),
        query: jest
          .fn()
          // check FAILED events count
          .mockImplementationOnce((sql, params, cb) => cb(null, [{ count: 0 }]))
          // get reservation totals and seat info
          .mockImplementationOnce((sql, params, cb) => cb(null, [{ totalPrice: 200, seatId: JSON.stringify([1]), externalFlightId: 'FL123' }]))
          // insert event
          .mockImplementationOnce((sql, params, cb) => cb(null, { insertId: 99 }))
          // update reservation to FAILED
          .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 1 }))
          // release seats
          .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 1 }))
          // update flight counters
          .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 1 })),
        commit: jest.fn(cb => cb(null)),
        rollback: jest.fn(cb => cb && cb()),
        release: jest.fn()
      };
      db.getConnection = jest.fn(cb => cb(null, mockConn));

      paymentEventsModel.createPaymentEventAndFailReservation(paymentData, cb);

      expect(cb).toHaveBeenCalledWith(null, { paymentEventId: 99, reservationId: 1 });
    });

  test('debería evitar insertar si ya existe un evento FAILED', () => {
      const cb = jest.fn();
      const paymentData = { reservationId: 1, externalUserId: 'user1', paymentStatus: 'FAILED' };

      const mockConn = {
        beginTransaction: jest.fn(cb => cb(null)),
        query: jest.fn()
          // check FAILED events count -> already exists
          .mockImplementationOnce((sql, params, cb) => cb(null, [{ count: 1 }])),
        rollback: jest.fn(cb => cb && cb()),
        release: jest.fn()
      };
      db.getConnection = jest.fn(cb => cb(null, mockConn));

      paymentEventsModel.createPaymentEventAndFailReservation(paymentData, cb);

      expect(cb).toHaveBeenCalledWith({ message: 'A FAILED payment event already exists for this reservationId.' });
    });
  });
});





