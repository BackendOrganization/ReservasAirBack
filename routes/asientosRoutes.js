const express = require('express');
const router = express.Router();
const asientosController = require('../controllers/asientosController.js');

// Ruta para obtener todos los asientos de un vuelo específico
router.get('/asientos/:idVuelo', asientosController.getTodosLosAsientos);


module.exports = router;