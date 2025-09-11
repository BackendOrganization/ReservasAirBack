const express = require('express');
const router = express.Router();
const reservasController = require('../controllers/reservasController.js');


// Ruta para cambiar el asiento de una reserva existente
router.post('/reservation/change-seat/:flightId', reservasController.cambiarAsientoReserva);


// Ruta para reservar un asiento disponible de un vuelo específico
router.post('/reservation/book/:flightId', reservasController.reservarAsiento);

// Ruta para cancelar una reserva (pasar de confirmado a disponible)
router.post('/reservation/cancel/:flightId', reservasController.cancelarAsiento);

module.exports = router;
