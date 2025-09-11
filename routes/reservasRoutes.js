const express = require('express');
const router = express.Router();
const reservasController = require('../controllers/reservasController.js');


// Ruta para cambiar el asiento de una reserva existente
router.post('/reservas/:idVuelo/cambiar', reservasController.cambiarAsientoReserva);


// Ruta para reservar un asiento disponible de un vuelo específico
router.post('/asientos/:idVuelo/reservar', reservasController.reservarAsiento);

// Ruta para cancelar una reserva (pasar de confirmado a disponible)
router.post('/asientos/:idVuelo/cancelar', reservasController.cancelarAsiento);

module.exports = router;
