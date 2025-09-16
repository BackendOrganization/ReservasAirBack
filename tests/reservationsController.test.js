// tests/reservationsController.test.js
const reservationsController = require('../controllers/reservationsController');
const reservationsModel = require('../models/reservationsModel');

jest.mock('../models/reservationsModel');

describe('reservationsController', () => {
    let mockRequest;
    let mockResponse;

    beforeEach(() => {
        mockRequest = {
            params: {},
            body: {}
        };
        mockResponse = {
            status: jest.fn(() => mockResponse),
            json: jest.fn(),
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getReservationsByExternalUserId', () => {
        test('Deberia obtener las reservas solamente pasandole el external user ID', () => {
            mockRequest.params.externalUserId = 'user123';
            const mockResults = [{ reservationId: 1 }];
            reservationsModel.getReservationsByExternalUserId.mockImplementationOnce((userId, callback) => {
                callback(null, mockResults);
            });
            reservationsController.getReservationsByExternalUserId(mockRequest, mockResponse);
            expect(reservationsModel.getReservationsByExternalUserId).toHaveBeenCalledWith('user123', expect.any(Function));
            expect(mockResponse.json).toHaveBeenCalledWith(mockResults);
        });

        test('Deberia retornar status code 400 por falta del campo externalUserId', () => {
            
            reservationsController.getReservationsByExternalUserId(mockRequest, mockResponse);
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Missing required parameter: externalUserId' });
        });

        test('Deberia retornar 500 si por alguna razon el modelo falla', () => {
            mockRequest.params.externalUserId = 'user123';
            reservationsModel.getReservationsByExternalUserId.mockImplementation((data, cb) => cb('DB error'));

            reservationsController.getReservationsByExternalUserId(mockRequest, mockResponse);

            //console.log("status:", mockResponse.status.mock.calls);
            //console.log("json:", mockResponse.json.mock.calls);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Error fetching reservations' });
        });
    });

    describe('changeSeat', () => {
        test('Deberia cambiar de asiento exitosamente', () => {
            mockRequest.body = { reservationId: 1, oldSeatId: 'A1', newSeatId: 'B2' };
            reservationsModel.changeSeat.mockImplementationOnce((resId, oldId, newId, callback) => {
                callback(null, { details: 'Cambio de asiento de A1 a B2' });
            });
            reservationsController.changeSeat(mockRequest, mockResponse);
            expect(reservationsModel.changeSeat).toHaveBeenCalledWith(1, 'A1', 'B2', expect.any(Function));
            expect(mockResponse.json).toHaveBeenCalledWith({ details: 'Cambio de asiento de A1 a B2' });
        });

        test('Deberia retornar 400 por falta de informacion', () => {
            mockRequest.body = { reservationId: 1 };
            reservationsController.changeSeat(mockRequest, mockResponse);
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Missing required fields' });
        });
    });

    describe('createReservation', () => {
        test('Deberia crear una reserva exitosamente', () => {
            mockRequest.params.reservationId = 'reserva_123';
            mockRequest.body = {
                externalUserId: 'user123',
                externalFlightId: 'flight123',
                seatIds: ['seat_A1', 'seat_A2'],
                amount: 150
            };
            reservationsModel.createReservation.mockImplementationOnce((reservationId,userId, flightId, seatIds, amount, callback) => {
                callback(null, { success: true, reservationId: 1 });
            });
            reservationsController.createReservation(mockRequest, mockResponse);
            expect(reservationsModel.createReservation).toHaveBeenCalledWith('reserva_123','user123', 'flight123', ['seat_A1', 'seat_A2'], 150, expect.any(Function));
            expect(mockResponse.json).toHaveBeenCalledWith({ success: true, reservationId: 1 });
        });

        test('Deberia retornar status code 400 por falta de campos requeridos', () => {
            mockRequest.params.reservationId = 'reserva_123';
            mockRequest.body = { externalUserId: 'user123' };
            reservationsController.createReservation(mockRequest, mockResponse);
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Missing required fields: reservationId (URL), externalUserId, externalFlightId, seatIds (array), amount' });
        });
    });

    describe('cancelReservation', () => {
        test('Deberia cancelar una reserva exitosamente', () => {
            mockRequest.params.reservationId = 1;
            mockRequest.body = { amount: 150 };
            reservationsModel.cancelReservation.mockImplementationOnce((resId, amount, callback) => {
                callback(null, { success: true });
            });
            reservationsController.cancelReservation(mockRequest, mockResponse);
            expect(reservationsModel.cancelReservation).toHaveBeenCalledWith(1, 150, expect.any(Function));
            expect(mockResponse.json).toHaveBeenCalledWith({ success: true });
        });

        test('Deberia retornar 400 por falta de campos', () => {
            mockRequest.params.reservationId = 1;
            reservationsController.cancelReservation(mockRequest, mockResponse);
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Missing required fields: reservationId (URL), amount' });
        });
    });

    describe('getFullReservationsByExternalUserId', () => {
        test('Deberia obtener full reservations pasandole el externalUserId', () => {
            mockRequest.params.externalUserId = 'user123';
            const mockResults = [{ reservationId: 1, flightData: {} }];
            reservationsModel.getFullReservationsByExternalUserId.mockImplementationOnce((userId, callback) => {
                callback(null, mockResults);
            });
            reservationsController.getFullReservationsByExternalUserId(mockRequest, mockResponse);
            expect(reservationsModel.getFullReservationsByExternalUserId).toHaveBeenCalledWith('user123', expect.any(Function));
            expect(mockResponse.json).toHaveBeenCalledWith(mockResults);
        });

        test('Deberia retornar 400 por falta de externalUserId', () => {
            reservationsController.getFullReservationsByExternalUserId(mockRequest, mockResponse);
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Missing required parameter: externalUserId' });
        });
    });
});