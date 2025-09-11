const express = require('express');
const router = express.Router();
const paymentEventsController = require('../controllers/paymentEventsController.js');

router.post('/payment/confirm', paymentEventsController.confirmPayment);

router.post('/payment/cancel', paymentEventsController.cancelPayment);

module.exports = router;