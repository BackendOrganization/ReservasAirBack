const express = require('express');
const router = express.Router();
const flightsController = require('../controllers/flightsController.js');

router.post('/flights/ingest', flightsController.ingestFlight);

module.exports = router;