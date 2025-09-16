const express = require('express');
const router = express.Router();
const paymentEventsController = require('../controllers/paymentEventsController.js');

router.post('/payment/confirm', paymentEventsController.confirmPayment);

router.post('/payment/cancel', paymentEventsController.cancelPayment);

// Nuevo endpoint para marcar pago como fallido y crear evento
router.post('/payment/fail', paymentEventsController.failPayment);

module.exports = router;