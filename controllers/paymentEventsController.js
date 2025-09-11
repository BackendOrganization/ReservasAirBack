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
