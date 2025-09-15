const express = require('express');
const router = express.Router();
const seatsController = require('../controllers/seatsController.js');

router.get('/seats/flight/:externalFlightId', seatsController.getReservedOrConfirmedSeats);




module.exports = router;