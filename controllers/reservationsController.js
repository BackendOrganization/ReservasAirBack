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
	const userId = req.body.userId;
	const flightId = req.body.flightId;
	const seatId = req.body.seatId;
	const amount = req.body.amount;
	if (!userId || !flightId || !seatId || amount == null) {
		return res.status(400).json({ error: 'Missing required fields: userId, flightId, seatId, amount' });
	}
	reservationsModel.createReservation(userId, flightId, seatId, amount, (err, result) => {
		if (err) {
			console.error(err);
			return res.status(500).json({ error: 'Error creating reservation' });
		}
		res.json(result);
	});
};

exports.cancelReservation = (req, res) => {
	const userId = req.body.userId;
	const flightId = req.body.flightId;
	const seatId = req.body.seatId;
	const amount = req.body.amount;
	if (!userId || !flightId || !seatId || amount == null) {
		return res.status(400).json({ error: 'Missing required fields: userId, flightId, seatId, amount' });
	}
	reservationsModel.cancelReservation(userId, flightId, seatId, amount, (err, result) => {
		if (err) {
			console.error(err);
			return res.status(500).json({ error: 'Error cancelling reservation' });
		}
		res.json(result);
	});
};
