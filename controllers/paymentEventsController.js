const paymentEventsModel = require('../models/paymentEventsModel');
const reservationsModel = require('../models/reservationsModel');
const seatsModel = require('../models/seatsModel');

exports.confirmPayment = (req, res) => {
    const { paymentStatus, reservationId, externalUserId } = req.body;
    console.log('[confirmPayment] Datos recibidos:', { paymentStatus, reservationId, externalUserId });
    if (!paymentStatus || !reservationId || !externalUserId) {
        return res.status(400).json({ error: 'Missing required fields: paymentStatus, reservationId, externalUserId' }); // 400
    }
    if (paymentStatus !== 'SUCCESS') {
        return res.status(400).json({ error: 'Only paymentStatus SUCCESS is allowed for confirmation.' }); // 400
    }
    let responded = false;
    paymentEventsModel.confirmPayment(paymentStatus, reservationId, externalUserId, (err, result) => {
        if (responded) return;
        responded = true;
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error confirming payment' }); // 500
        }
        if (result && result.success === false) {
            return res.status(400).json({ error: result.message }); // 400
        }
        res.status(200).json(result); // 200
    });
};

exports.cancelPayment = (req, res) => {
    const { reservationId, externalUserId } = req.body;
    if (!reservationId || !externalUserId) {
        return res.status(400).json({ error: 'Missing required fields: reservationId, externalUserId' }); // 400
    }
    paymentEventsModel.cancelPayment(reservationId, externalUserId, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error cancelling payment' }); // 500
        }
        res.status(200).json(result); // 200
    });
};

exports.failPayment = (req, res) => {
    const paymentData = req.body;
    if (!paymentData.paymentStatus || !paymentData.reservationId || !paymentData.externalUserId) {
        return res.status(400).json({ error: 'Missing required payment data' }); // 400
    }
    paymentEventsModel.createPaymentEventAndFailReservation(paymentData, (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Error processing payment event', details: err }); // 500
        }
        res.status(201).json({ message: 'Payment event created and reservation marked as FAILED', ...result }); // 201
    });
};
