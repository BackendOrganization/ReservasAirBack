const seatsModel = require('../models/seatsModel');


// Get reserved or confirmed seats with flight info
exports.getReservedOrConfirmedSeats = (req, res) => {
    const externalFlightId = req.params.externalFlightId || req.query.externalFlightId;
    if (!externalFlightId) {
        return res.status(400).json({ error: 'Missing externalFlightId' });
    }
    seatsModel.getReservedOrConfirmedSeats(externalFlightId, (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error getting seats' });
        }
        res.json(data);
    });
};

