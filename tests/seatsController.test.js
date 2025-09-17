// tests/seatsController.test.js
const seatsController = require('../controllers/seatsController');
const seatsModel = require('../models/seatsModel');

jest.mock('../models/seatsModel');

describe('seatsController', () => {
    let mockRequest;
    let mockResponse;

    beforeEach(() => {
        mockRequest = {
            params: {},
            query: {}
        };
        mockResponse = {
            status: jest.fn(() => mockResponse),
            json: jest.fn(),
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getReservedOrConfirmedSeats', () => {
        test('deberia obtener los asientos reservados para un vuelo', () => {
            mockRequest.params.externalFlightId = 'flight123';
            const mockData = { flightId: 'flight123', occupiedSeats: [], reservedSeats: ['A1'] };
            seatsModel.getReservedOrConfirmedSeats.mockImplementationOnce((flightId, callback) => {
                callback(null, mockData);
            });
            seatsController.getReservedOrConfirmedSeats(mockRequest, mockResponse);
            expect(seatsModel.getReservedOrConfirmedSeats).toHaveBeenCalledWith('flight123', expect.any(Function));
            expect(mockResponse.json).toHaveBeenCalledWith(mockData);
        });

        test('Deberia devolver 400 por falta del campo externalFlightId ', () => {
            seatsController.getReservedOrConfirmedSeats(mockRequest, mockResponse);
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Missing externalFlightId' });
        });

        test('Deberia retornar 500 por error en el modelo', () => {
            mockRequest.params.externalFlightId = 'flight123';
            seatsModel.getReservedOrConfirmedSeats.mockImplementationOnce((flightId, callback) => {
                callback('Database Error');
            });
            seatsController.getReservedOrConfirmedSeats(mockRequest, mockResponse);
            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Error getting seats' });
        });
    });
});