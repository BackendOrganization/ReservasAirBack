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
    test('Deberia obtener las reservas solamente pasandole el external user ID', () => {
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

    test('Deberia retornar status code 400 por falta del campo externalUserId', () => {
      reservationsController.getReservationsByExternalUserId(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Missing required parameter: externalUserId'
      });
    });

    test('Deberia retornar 500 si por alguna razon el modelo falla', () => {
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
    test('Deberia cambiar de asiento exitosamente', () => {
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

    test('Deberia retornar 400 por falta de informacion', () => {
      reservationsController.changeSeat(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Missing required fields'
      });
    });
  });

 
  describe('createReservation', () => {
    test('Deberia crear una reserva exitosamente', () => {
      mockRequest.params = { externalUserId: 'user123', externalFlightId: 'flight123' };
      mockRequest.body = { seatIds: ['seat_A1', 'seat_A2'], amount: 150 };

      reservationsModel.createReservation.mockImplementationOnce((...args) => {
        const cb = args[args.length - 1];
        cb(null, { success: true, reservationId: 1 });
      });

      reservationsController.createReservation(mockRequest, mockResponse);

      expect(reservationsModel.createReservation).toHaveBeenCalledWith(
        'user123',
        'flight123',
        ['seat_A1', 'seat_A2'],
        expect.any(Function)
      );
      expect(mockResponse.json).toHaveBeenCalledWith({ success: true, reservationId: 1 });
    });

    test('Deberia retornar status code 400 por falta de campos requeridos', () => {
      reservationsController.createReservation(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error:
          'Missing required fields: externalUserId (URL), externalFlightId (URL), seatIds (array)'
      });
    });
  });

  describe('cancelReservation', () => {
    test('Deberia cancelar una reserva exitosamente', () => {
      mockRequest.params.reservationId = 1;
      mockRequest.body = { amount: 150 };

      reservationsModel.cancelReservation.mockImplementationOnce((...args) => {
        const cb = args[args.length - 1];
        cb(null, { success: true });
      });

      reservationsController.cancelReservation(mockRequest, mockResponse);

      expect(reservationsModel.cancelReservation).toHaveBeenCalledWith(
        1,
        expect.any(Function)
      );
      expect(mockResponse.json).toHaveBeenCalledWith({ success: true });
    });

    test('Deberia retornar 400 por falta de campos', () => {
      reservationsController.cancelReservation(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Missing required field: reservationId (URL)'
      });
    });
  });

  describe('getFullReservationsByExternalUserId', () => {
    test('Deberia obtener full reservations pasandole el externalUserId', () => {
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

    test('Deberia retornar 400 por falta de externalUserId', () => {
      reservationsController.getFullReservationsByExternalUserId(mockRequest, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Missing required parameter: externalUserId'
      });
    });
  });
});
