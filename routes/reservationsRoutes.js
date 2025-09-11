const express = require('express');
const router = express.Router();
const reservationsController = require('../controllers/reservationsController.js');


// Ruta para cambiar el asiento de una reserva existente
router.post('/reservation/change-seat', reservationsController.changeSeat);


// Ruta para reservar un asiento disponible de un vuelo específico
router.post('/reservation/book', reservationsController.createReservation);

// Ruta para cancelar una reserva (pasar de confirmado a disponible)
router.post('/reservation/cancel', reservationsController.cancelReservation);

router.get('/reservation/user/:externalUserId', reservationsController.getReservationsByExternalUserId);

module.exports = router;
