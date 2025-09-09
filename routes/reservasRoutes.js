const express = require('express');
const router = express.Router();
const reservasController = require('../controllers/reservasController.js');

// Ruta para reservar un asiento disponible de un vuelo específico
router.post('/asientos/:idVuelo/reservar', reservasController.reservarAsiento);

module.exports = router;
