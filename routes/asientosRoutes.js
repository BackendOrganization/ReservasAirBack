const express = require('express');
const router = express.Router();
const asientosController = require('../controllers/asientosController.js');

// Ruta para obtener todos los asientos de un vuelo específico
router.get('/asientos/:idVuelo', asientosController.getTodosLosAsientos);

// Ruta para obtener asientos libres de un vuelo específico
router.get('/asientos/:idVuelo/libres', asientosController.getAsientosLibres);

module.exports = router;