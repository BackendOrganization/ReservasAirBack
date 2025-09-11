const express = require('express');
const router = express.Router();
const seatsController = require('../controllers/seatsController.js');

router.get('/seats/flight/:flightId', seatsController.getAllSeats);

//router.get('/asientos/:idVuelo/libres', asientosController.getAsientosLibres);

//router.get('/asientos/:idVuelo/ocupados', asientosController.getAsientosOcupados);


module.exports = router;