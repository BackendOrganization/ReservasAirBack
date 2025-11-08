const db = require('../config/db');
const paymentEventsModel = jest.requireActual('../models/paymentEventsModel');

describe('paymentEventsModel', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('confirmPayment', () => {
  test('debería confirmar el pago (camino feliz completo)', (done) => {
      const cb = (err, res) => {
        expect(err).toBeNull();
        expect(res).toEqual({
          success: true,
          message: 'Payment confirmed, reservation PAID, seats CONFIRMED, payment event created.',
          reservationDate: '2024-01-01T00:00:00.000Z',
          flightDate: '2024-02-01'
        });
        done();
      };
      
      // Mock 1: SELECT status FROM reservations - debe retornar PENDING
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, [{ status: 'PENDING' }]));

      // Mock 2: SELECT amount FROM payment_events WHERE reservationId = ? AND status = 'PENDING'
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, [{ amount: 200 }]));

      // Mock pool connection
      const mockConn = {
        beginTransaction: jest.fn(fn => fn(null)),
        query: jest
          .fn()
          // 1) insert query (INSERT INTO paymentEvents)
          .mockImplementationOnce((sql, params, cb) => cb(null, { insertId: 1 }))
          // 2) update reservation query (UPDATE reservations SET status = 'PAID')
          .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 1 }))
          // 3) devuelve reservation con seatId JSON + flight id
          .mockImplementationOnce((sql, params, cb) => cb(null, [{ seatId: JSON.stringify([1]), externalFlightId: 'FL123' }]))
          // 4) getDatesQuery - retorna fechas
          .mockImplementationOnce((sql, params, cb) => cb(null, [{ reservationDate: '2024-01-01T00:00:00.000Z', flightDate: '2024-02-01' }]))
          // 5) confirm Seat sQuery (UPDATE seats SET status = 'CONFIRMED')
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
      // Mock 1: SELECT status - retorna PENDING
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, [{ status: 'PENDING' }]));
      // Mock 2: SELECT payment_events - NO hay evento pendiente
      db.query.mockImplementationOnce((sql, params, callback) => callback(null, []));

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
          // 1) findReservationQuery (FOR UPDATE) - debe retornar PENDING_REFUND
          .mockImplementationOnce((sql, params, cb) => cb(null, [{ reservationId: 1, status: 'PENDING_REFUND', seatId: JSON.stringify([1]), externalFlightId: 'FL123', totalPrice: 200 }]))
          // 2) cancelQuery (UPDATE reservations SET status = 'CANCELLED')
          .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 1 }))
          // 3) getReservationQuery (SELECT seatId, externalFlightId, totalPrice)
          .mockImplementationOnce((sql, params, cb) => cb(null, [{ seatId: JSON.stringify([1]), externalFlightId: 'FL123', totalPrice: 200 }]))
          // 4) refundEvent insert (INSERT INTO paymentEvents)
          .mockImplementationOnce((sql, params, cb) => cb(null, { insertId: 99 }))
          // 5) getDatesQuery - retorna fechas
          .mockImplementationOnce((sql, params, cb) => cb(null, [{ reservationDate: '2024-01-01T00:00:00.000Z', flightDate: '2024-02-01' }]))
          // 6) release seats (UPDATE seats SET status = 'AVAILABLE')
          .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 1 }))
          // 7) update flights counters (UPDATE flights SET freeSeats...)
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
          message: 'Reservation cancelled, seats released, refund event created.',
          reservationDate: '2024-01-01T00:00:00.000Z',
          flightDate: '2024-02-01'
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
          // 1) check FAILED events count
          .mockImplementationOnce((sql, params, cb) => cb(null, [{ count: 0 }]))
          // 2) get reservation totals and seat info WITH status PENDING
          .mockImplementationOnce((sql, params, cb) => cb(null, [{ totalPrice: 200, seatId: JSON.stringify([1]), externalFlightId: 'FL123', status: 'PENDING' }]))
          // 3) insert event
          .mockImplementationOnce((sql, params, cb) => cb(null, { insertId: 99 }))
          // 4) update reservation to FAILED
          .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 1 }))
          // 5) get dates query
          .mockImplementationOnce((sql, params, cb) => cb(null, [{ reservationDate: '2024-01-01', flightDate: '2024-02-01' }]))
          // 6) release seats
          .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 1 }))
          // 7) update flight counters
          .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 1 })),
        commit: jest.fn(cb => cb(null)),
        rollback: jest.fn(cb => cb && cb()),
        release: jest.fn()
      };
      db.getConnection = jest.fn(cb => cb(null, mockConn));

      paymentEventsModel.createPaymentEventAndFailReservation(paymentData, cb);

      expect(cb).toHaveBeenCalledWith(null, { 
        paymentEventId: 99, 
        reservationId: 1,
        reservationDate: '2024-01-01',
        flightDate: '2024-02-01'
      });
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





