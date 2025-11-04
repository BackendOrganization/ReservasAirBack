const express = require('express');
const router = express.Router();
const paymentEventsController = require('../controllers/paymentEventsController.js');

router.post('/payment/confirm', paymentEventsController.confirmPayment);

router.post('/payment/cancel', paymentEventsController.cancelPayment);

// Nuevo endpoint para marcar pago como fallido y crear evento
router.post('/payment/fail', paymentEventsController.failPayment);

// Endpoint GET para verificar si el pago fue confirmado (PAID)
router.get('/payment/notify/:reservationId', paymentEventsController.notifyPaymentStatus);

// Endpoint GET para verificar si el pago falló (FAILED)
router.get('/payment/notify/failed/:reservationId', paymentEventsController.notifyPaymentFailed);

module.exports = router;