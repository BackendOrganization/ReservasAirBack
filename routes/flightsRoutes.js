
const express = require('express');
const router = express.Router();
const flightsController = require('../controllers/flightsController.js');

// Ruta para insertar un vuelo
router.post('/flights/ingest', flightsController.ingestFlight);

// Ruta para obtener todos los vuelos
router.get('/flights', flightsController.getAllFlights);

// Ruta para cancelar reservas de un vuelo
router.post('/flights/:externalFlightId/cancel', flightsController.cancelFlightReservations);

module.exports = router;