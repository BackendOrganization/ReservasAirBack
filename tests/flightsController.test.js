
const flightsController = require('../controllers/flightsController');
const flightsModel = require('../models/flightsModel');

jest.mock('../models/flightsModel');

describe('flightsController', () => {
    let mockRequest;
    let mockResponse;

    beforeEach(() => {
        mockRequest = {
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

    describe('ingestFlight', () => {
        test('deberia reservar un vuelo exitosamente y retornar 201', () => {
            const mockFlightData = {
                id: 'AR123',
                origin: { city: 'NYC' },
                destination: { city: 'LAX' },
                aircraft: 'B747',
                aircraftModel: 'Boeing 747',
                date: '2025-10-27',
                duration: '6h',
                freeSeats: 300
            };
            mockRequest.body = mockFlightData;
            flightsModel.insertFlight.mockImplementationOnce((data, callback) => {
                callback(null, { insertId: 1 });
            });

            flightsController.ingestFlight(mockRequest, mockResponse);

            expect(flightsModel.insertFlight).toHaveBeenCalledWith(mockFlightData, expect.any(Function));
            expect(mockResponse.status).toHaveBeenCalledWith(201);
            expect(mockResponse.json).toHaveBeenCalledWith({
                message: 'Flight inserted successfully',
                flightId: 'AR123'
            });
        });

        test('deberia retornar 400 de status code ya que hay los datos estan incompletos', () => {
            mockRequest.body = { id: 'AR123' }; // se envia body incompleto
            flightsController.ingestFlight(mockRequest, mockResponse);
            
            expect(flightsModel.insertFlight).not.toHaveBeenCalled();
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({
                error: 'Missing required flight data'
            });
        });

        test('Deberia retornar error 500 por error en el modelo', () => {
            const mockFlightData = {
                id: 'AR123',
                origin: {},
                destination: {}
            };
            mockRequest.body = mockFlightData;
            flightsModel.insertFlight.mockImplementationOnce((data, callback) => {
                callback('Database Error');
            });

            flightsController.ingestFlight(mockRequest, mockResponse);

            expect(flightsModel.insertFlight).toHaveBeenCalled();
            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.json).toHaveBeenCalledWith({
                error: 'Error inserting flight',
                details: 'Database Error'
            });
        });
    });
});