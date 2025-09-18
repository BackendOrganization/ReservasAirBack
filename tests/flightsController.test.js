const flightsController = require('../controllers/flightsController');
const flightsModel = require('../models/flightsModel');

jest.mock('../models/flightsModel');

describe('flightsController', () => {
  let mockRequest, mockResponse;

  beforeEach(() => {
    mockRequest = { body: {} };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    jest.clearAllMocks();
  });

  describe('ingestFlight', () => {
    test('deberia reservar un vuelo exitosamente y retornar 201', () => {
      const mockFlightData = {
        id: 'AR123',
        origin: 'BUE',
        destination: 'MIA',
        aircraft: 'A320'
      };

      mockRequest.body = mockFlightData;

      flightsModel.insertFlight.mockImplementationOnce((data, cb) => {
        cb(null, { flightId: 'AR123' });
      });

      flightsController.ingestFlight(mockRequest, mockResponse);

      expect(flightsModel.insertFlight).toHaveBeenCalledWith(mockFlightData, expect.any(Function));
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Flight and seats created successfully',
        flightId: 'AR123'
      });
    });

    test('deberia retornar 400 de status code ya que hay los datos estan incompletos', () => {
     
      flightsController.ingestFlight(mockRequest, mockResponse);

      expect(flightsModel.insertFlight).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Missing required flight data (id, origin, destination, aircraft)'
      });
    });

    test('Deberia retornar error 500 por error en el modelo', () => {
      const mockFlightData = {
        id: 'AR123',
        origin: 'BUE',
        destination: 'MIA',
        aircraft: 'A320'
      };

      mockRequest.body = mockFlightData;

      flightsModel.insertFlight.mockImplementationOnce((data, cb) => {
        cb(new Error('DB error'));
      });

      flightsController.ingestFlight(mockRequest, mockResponse);

      expect(flightsModel.insertFlight).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Error inserting flight',
         details: expect.objectContaining({ message: 'DB error' })
      });
    });
  });
});