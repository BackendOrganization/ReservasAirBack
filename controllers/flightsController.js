
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

// Nuevo método: cancela todas las reservas de un vuelo y crea eventos de pago cancelados
exports.cancelFlightReservations = (req, res) => {
    const externalFlightId = req.params.externalFlightId;
    if (!externalFlightId) {
        return res.status(400).json({ error: 'Missing externalFlightId' });
    }
    flightsModel.cancelReservationsByFlight(externalFlightId, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error cancelling reservations', details: err });
        }
        res.json({ message: 'Reservations cancelled', ...result });
    });
};