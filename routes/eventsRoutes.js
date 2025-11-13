const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/eventsController');

// Ruta para obtener los últimos 5 eventos del producer
router.get('/events', eventsController.getLatestEvents);

module.exports = router;
