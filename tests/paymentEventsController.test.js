// tests/paymentEventsController.test.js
const paymentEventsController = require('../controllers/paymentEventsController');
const paymentEventsModel = require('../models/paymentEventsModel');

jest.mock('../models/paymentEventsModel');

// Mock kafkaProducer at module level before requiring controller
jest.mock('../utils/kafkaProducer', () => ({
    sendEvent: jest.fn().mockResolvedValue(true),
    sendReservationUpdatedEvent: jest.fn().mockResolvedValue(true)
}));

describe('paymentEventsController', () => {
    let mockRequest;
    let mockResponse;

    beforeEach(() => {
        mockRequest = { body: {} };
        mockResponse = {
            status: jest.fn(() => mockResponse),
            json: jest.fn(),
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('confirmPayment', () => {
    test('debería confirmar pago exitoso', (done) => {
            mockRequest.body = {
                paymentStatus: 'SUCCESS',
                reservationId: 1,
                externalUserId: 'user123'
            };
            paymentEventsModel.confirmPayment.mockImplementationOnce((status, resId, userId, callback) => {
                callback(null, { success: true });
            });
            
            paymentEventsController.confirmPayment(mockRequest, mockResponse);
            
            // Wait for async event publishing
            setTimeout(() => {
                expect(paymentEventsModel.confirmPayment).toHaveBeenCalledWith('SUCCESS', 1, 'user123', expect.any(Function));
                expect(mockResponse.json).toHaveBeenCalledWith({ success: true });
                done();
            }, 50);
        });

    test('debería retornar status code 400 por falta de campos requeridos', () => {
            mockRequest.body = { paymentStatus: 'SUCCESS' };
            paymentEventsController.confirmPayment(mockRequest, mockResponse);
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Missing required fields: paymentStatus, reservationId, externalUserId' });
        });

    test('debería retornar 400 si el estado del pago no es SUCCESS', () => {
            mockRequest.body = { paymentStatus: 'FAILED', reservationId: 1, externalUserId: 'user123' };
            paymentEventsController.confirmPayment(mockRequest, mockResponse);
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Only paymentStatus SUCCESS is allowed for confirmation.' });
        });

    test('debería retornar status code 500 si el modelo falla', () => {
            mockRequest.body = { paymentStatus: 'SUCCESS', reservationId: 1, externalUserId: 'user1' };
            paymentEventsModel.confirmPayment.mockImplementation((_, __, ___, cb) => cb('DB error'));

            paymentEventsController.confirmPayment(mockRequest, mockResponse);

            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Error confirming payment' });
        });
    });

    describe('cancelPayment', () => {
    test('debería cancelar el pago exitosamente', (done) => {
            mockRequest.body = { reservationId: 1, externalUserId: 'user123' };
            paymentEventsModel.cancelPayment.mockImplementationOnce((resId, userId, callback) => {
                callback(null, { success: true });
            });
            
            paymentEventsController.cancelPayment(mockRequest, mockResponse);
            
            // Wait for async event publishing
            setTimeout(() => {
                expect(paymentEventsModel.cancelPayment).toHaveBeenCalledWith(1, 'user123', expect.any(Function));
                expect(mockResponse.json).toHaveBeenCalledWith({ success: true });
                done();
            }, 50);
        });

    test('debería retornar 400 por falta de datos', () => {
            mockRequest.body = { reservationId: 1 };
            paymentEventsController.cancelPayment(mockRequest, mockResponse);
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Missing required fields: reservationId, externalUserId' });
        });
    });

    describe('failPayment', () => {
    test('debería procesar un pago fallido y marcar el pago como FAILED', (done) => {
            const paymentData = { paymentStatus: 'FAILED', reservationId: 1, externalUserId: 'user123' };
            mockRequest.body = paymentData;

            // Mock para simular la consulta a la base de datos
            const db = require('../config/db');
            jest.spyOn(db, 'query').mockImplementation((query, values, callback) => {
                if (query.includes('SELECT status FROM reservations')) {
                    callback(null, [{ status: 'PENDING' }]); // Simular que la reserva existe y está en estado PENDING
                }
            });

            // Mock para simular el comportamiento del modelo
            paymentEventsModel.createPaymentEventAndFailReservation.mockImplementationOnce((data, callback) => {
                callback(null, { paymentEventId: 10, reservationId: 1 });
            });

            // Agregar logs para depuración
            console.log('[Test] Datos enviados al controlador:', mockRequest.body);

            // Llamar al controlador
            paymentEventsController.failPayment(mockRequest, mockResponse);

            // Esperar a que se complete la publicación del evento asíncrono
            setTimeout(() => {
                try {
                    // Verificar que el modelo fue llamado con los datos correctos
                    expect(paymentEventsModel.createPaymentEventAndFailReservation).toHaveBeenCalledWith(paymentData, expect.any(Function));

                    // Verificar que la respuesta HTTP sea correcta
                    expect(mockResponse.status).toHaveBeenCalledWith(201);
                    expect(mockResponse.json).toHaveBeenCalledWith({
                        message: 'Payment event created and reservation marked as FAILED',
                        paymentEventId: 10,
                        reservationId: 1
                    });

                    console.log('[Test] Prueba completada exitosamente.');
                    done();
                } catch (error) {
                    console.error('[Test] Error en la prueba:', error);
                    done(error);
                }
            }, 100); // Incrementar el tiempo de espera si es necesario
        });

    test('debería retornar 400 por falta de datos', () => {
            mockRequest.body = {};
            paymentEventsController.failPayment(mockRequest, mockResponse);

            // Verificar que se devuelva un error 400
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Missing required payment data' });
        });
    });
});