const flightsModel = require('../models/flightsModel');

exports.ingestFlight = (req, res) => {
    const flightData = req.body;
    if (!flightData || !flightData.id || !flightData.origin || !flightData.destination) {
        return res.status(400).json({ error: 'Missing required flight data' });
    }
    flightsModel.insertFlight(flightData, (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Error inserting flight', details: err });
        }
        res.status(201).json({ message: 'Flight inserted successfully', flightId: flightData.id });
    });
};
