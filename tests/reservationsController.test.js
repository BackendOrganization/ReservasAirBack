// Mock kafka producer to avoid external integration during controller tests
jest.mock('../utils/kafkaProducer', () => ({
  sendReservationEvent: jest.fn().mockResolvedValue({}),
  sendReservationCreatedEvent: jest.fn().mockResolvedValue({}),
  sendReservationCreatedHttpEvent: jest.fn().mockResolvedValue({}),
  sendReservationUpdatedEvent: jest.fn().mockResolvedValue({})
}));

const reservationsController = require('../controllers/reservationsController');
const reservationsModel = require('../models/reservationsModel');

jest.mock('../models/reservationsModel');

describe('reservationsController', () => {
  let mockRequest, mockResponse;

  beforeEach(() => {
    mockRequest = { params: {}, body: {}, query: {} };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    jest.clearAllMocks();
  });

  describe('getReservationsByExternalUserId', () => {
  test('debería obtener las reservas solamente pasándole el externalUserId', () => {
      mockRequest.params.externalUserId = 'user123';
      reservationsModel.getReservationsByExternalUserId.mockImplementationOnce((id, cb) =>
        cb(null, [{ reservationId: 1 }])
      );

      reservationsController.getReservationsByExternalUserId(mockRequest, mockResponse);

      expect(reservationsModel.getReservationsByExternalUserId).toHaveBeenCalledWith(
        'user123',
        expect.any(Function)
      );
      expect(mockResponse.json).toHaveBeenCalledWith([{ reservationId: 1 }]);
    });

  test('debería retornar status code 400 por falta del campo externalUserId', () => {
      reservationsController.getReservationsByExternalUserId(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Missing required parameter: externalUserId'
      });
    });

  test('debería retornar 500 si por alguna razón el modelo falla', () => {
      mockRequest.params.externalUserId = 'user123';
      reservationsModel.getReservationsByExternalUserId.mockImplementationOnce((id, cb) =>
        cb(new Error('DB error'))
      );

      reservationsController.getReservationsByExternalUserId(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Error fetching reservations' });
    });
  });

  
  describe('changeSeat', () => {
  test('debería cambiar de asiento exitosamente', () => {
      mockRequest.body = { reservationId: 1, oldSeatId: 'A1', newSeatId: 'B2' };
      reservationsModel.changeSeat.mockImplementationOnce((...args) => {
        const cb = args[args.length - 1];
        cb(null, { details: 'Cambio de asiento de A1 a B2' });
      });

      reservationsController.changeSeat(mockRequest, mockResponse);

      expect(reservationsModel.changeSeat).toHaveBeenCalledWith(
        1,
        'A1',
        'B2',
        expect.any(Function)
      );
      expect(mockResponse.json).toHaveBeenCalledWith({ details: 'Cambio de asiento de A1 a B2' });
    });

  test('debería retornar 400 por falta de información', () => {
      reservationsController.changeSeat(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Missing required fields'
      });
    });
  });

 
  describe('createReservation', () => {
  test('debería crear una reserva exitosamente', async () => {
      mockRequest.params = { externalUserId: 'user123', externalFlightId: 'flight123' };
      mockRequest.body = { seatIds: ['seat_A1', 'seat_A2'] };

      reservationsModel.getFlightByExternalFlightId = jest.fn().mockResolvedValueOnce({ currency: 'ARS' });
      reservationsModel.createReservation.mockImplementationOnce((...args) => {
        const cb = args[args.length - 1];
        cb(null, { success: true, reservationId: 1, totalPrice: 200 });
      });

      await reservationsController.createReservation(mockRequest, mockResponse);

      expect(reservationsModel.getFlightByExternalFlightId).toHaveBeenCalledWith('flight123');
      expect(reservationsModel.createReservation).toHaveBeenCalledWith(
        'user123',
        'flight123',
        ['seat_A1', 'seat_A2'],
        'ARS',
        expect.any(Function)
      );
      expect(mockResponse.json).toHaveBeenCalledWith({ success: true, reservationId: 1, totalPrice: 200 });

      const kafkaProducer = require('../utils/kafkaProducer');
      expect(kafkaProducer.sendReservationCreatedHttpEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          reservationId: '1',
          userId: 'user123',
          flightId: 'flight123',
          currency: 'ARS',
          amount: 200
        })
      );
    });

  test('debería retornar status code 400 por falta de campos requeridos', () => {
      reservationsController.createReservation(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error:
          'Missing required fields: externalUserId (URL), externalFlightId (URL), seatIds (array)'
      });
    });

  test('debería retornar status code 500 si falla la obtención de currency', async () => {
      mockRequest.params = { externalUserId: 'user123', externalFlightId: 'flight123' };
      mockRequest.body = { seatIds: ['seat_A1', 'seat_A2'] };

      reservationsModel.getFlightByExternalFlightId = jest.fn().mockRejectedValueOnce(new Error('DB error'));

      await reservationsController.createReservation(mockRequest, mockResponse);

      expect(reservationsModel.getFlightByExternalFlightId).toHaveBeenCalledWith('flight123');
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Failed to fetch flight data for currency' });
    });
  });

  describe('cancelReservation', () => {
  test('debería cancelar una reserva exitosamente', async () => {
      mockRequest.params.reservationId = 1;

      reservationsModel.cancelReservation.mockImplementationOnce((...args) => {
        const cb = args[args.length - 1];
        cb(null, {
          success: true,
          reservationDate: '2025-11-01T00:00:00.000Z',
          flightDate: '2025-11-10T00:00:00.000Z'
        });
      });

      await reservationsController.cancelReservation(mockRequest, mockResponse);

      expect(reservationsModel.cancelReservation).toHaveBeenCalledWith(1, expect.any(Function));
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        reservationDate: '2025-11-01T00:00:00.000Z',
        flightDate: '2025-11-10T00:00:00.000Z'
      });

      const kafkaProducer = require('../utils/kafkaProducer');
      expect(kafkaProducer.sendReservationUpdatedEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          reservationId: 1,
          newStatus: 'PENDING_REFUND',
          reservationDate: expect.stringMatching(/^2025-11-01T00:00:00(\.000)?Z$/),
          flightDate: expect.stringMatching(/^2025-11-10T00:00:00(\.000)?Z$/)
        })
      );
    });

  test('debería retornar 400 por falta de campos', () => {
      reservationsController.cancelReservation(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Missing required field: reservationId (URL)'
      });
    });
  });

  describe('getFullReservationsByExternalUserId', () => {
  test('debería obtener full reservations pasándole el externalUserId', () => {
      mockRequest.params.externalUserId = 'user123';
      reservationsModel.getFullReservationsByExternalUserId.mockImplementationOnce((id, cb) =>
        cb(null, [{ reservationId: 1 }])
      );

      reservationsController.getFullReservationsByExternalUserId(mockRequest, mockResponse);

      expect(reservationsModel.getFullReservationsByExternalUserId).toHaveBeenCalledWith(
        'user123',
        expect.any(Function)
      );
      expect(mockResponse.json).toHaveBeenCalledWith([{ reservationId: 1 }]);
    });

  test('debería retornar 400 por falta de externalUserId', () => {
      reservationsController.getFullReservationsByExternalUserId(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Missing required parameter: externalUserId'
      });
    });
  });
});

