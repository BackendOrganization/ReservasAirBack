const paymentEventsModel = require('../models/paymentEventsModel');
const reservationsModel = require('../models/reservationsModel');
const seatsModel = require('../models/seatsModel');

exports.confirmPayment = (req, res) => {
    const { paymentStatus, reservationId, externalUserId } = req.body;
    if (!paymentStatus || !reservationId || !externalUserId) {
        return res.status(400).json({ error: 'Missing required fields: paymentStatus, reservationId, externalUserId' });
    }
    if (paymentStatus !== 'SUCCESS') {
        return res.status(400).json({ error: 'Only paymentStatus SUCCESS is allowed for confirmation.' });
    }
    paymentEventsModel.confirmPayment(paymentStatus, reservationId, externalUserId, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error confirming payment' });
        }
        res.json(result);
    });
};

exports.cancelPayment = (req, res) => {
    const { reservationId, externalUserId } = req.body;
    if (!reservationId || !externalUserId) {
        return res.status(400).json({ error: 'Missing required fields: reservationId, externalUserId' });
    }
    paymentEventsModel.cancelPayment(reservationId, externalUserId, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error cancelling payment' });
        }
        res.json(result);
    });
};

exports.failPayment = (req, res) => {
    const paymentData = req.body;
    if (!paymentData.paymentStatus || !paymentData.reservationId || !paymentData.externalUserId) {
        return res.status(400).json({ error: 'Missing required payment data' });
    }
    paymentEventsModel.createPaymentEventAndFailReservation(paymentData, (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Error processing payment event', details: err });
        }
        res.status(201).json({ message: 'Payment event created and reservation marked as FAILED', ...result });
    });
};
