const express = require('express');
const router = express.Router();
const { publishPaymentEvent } = require('../utils/rabbitmq');

// En tu archivo de rutas (por ejemplo, reservasRoutes.js)
router.post('/test-rabbit', (req, res) => {
  publishPaymentEvent(req.body);
  res.json({ sent: true, event: req.body });
});

module.exports = router;