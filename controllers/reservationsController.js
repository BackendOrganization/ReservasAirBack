exports.getReservationsByExternalUserId = (req, res) => {
	const externalUserId = req.params.externalUserId;
	if (!externalUserId) {
		return res.status(400).json({ error: 'Missing required parameter: externalUserId' });
	}
	reservationsModel.getReservationsByExternalUserId(externalUserId, (err, results) => {
		if (err) {
			console.error(err);
			return res.status(500).json({ error: 'Error fetching reservations' });
		}
		res.json(results);
	});
};
const reservationsModel = require('../models/reservationsModel');


exports.changeSeat = (req, res) => {
	const reservationId = req.body.reservationId;
	const oldSeatId = req.body.oldSeatId;
	const newSeatId = req.body.newSeatId;
	if (!reservationId || !oldSeatId || !newSeatId) {
		return res.status(400).json({ error: 'Missing required fields' });
	}
	reservationsModel.changeSeat(reservationId, oldSeatId, newSeatId, (err, result) => {
		if (err) {
			console.error(err);
			return res.status(500).json({ error: 'Error changing seat for reservation' });
		}
		res.json(result);
	});
};


exports.createReservation = (req, res) => {
    const externalUserId = req.body.externalUserId;
    const externalFlightId = req.body.externalFlightId;
    const seatIds = req.body.seatIds; // <-- Cambiado de seatId a seatIds
    const amount = req.body.amount;
    if (!externalUserId || !externalFlightId || !Array.isArray(seatIds) || seatIds.length === 0 || amount == null) {
        return res.status(400).json({ error: 'Missing required fields: externalUserId, externalFlightId, seatIds (array), amount' });
    }
    reservationsModel.createReservation(externalUserId, externalFlightId, seatIds, amount, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Seat is already reserved' });
        }
        res.json(result);
    });
};

exports.cancelReservation = (req, res) => {
    const reservationId = req.body.reservationId;
    const amount = req.body.amount;
    if (!reservationId || amount == null) {
        return res.status(400).json({ error: 'Missing required fields: reservationId, amount' });
    }
    reservationsModel.cancelReservation(reservationId, amount, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error cancelling reservation' });
        }
        res.json(result);
    });
};
