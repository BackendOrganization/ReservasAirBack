const express = require('express');
const router = express.Router();
const asientosController = require('../controllers/asientosController.js');

router.get('/asientos/:idVuelo', asientosController.getTodosLosAsientos);

//router.get('/asientos/:idVuelo/libres', asientosController.getAsientosLibres);

//router.get('/asientos/:idVuelo/ocupados', asientosController.getAsientosOcupados);

//router.put('/asientos/:idReserva/actualizar', asientosController.actualizarAsientos);

module.exports = router;