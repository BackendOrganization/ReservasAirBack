const express = require("express");
const app = express();
const PORT = process.env.PORT || 8080;
const dotenv = require('dotenv').config();
const cors = require('cors');

// Importar inicializador de Kafka
const { initializeKafka } = require('./utils/kafkaInitializer');

app.use(cors({ origin: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Welcome to ReservasAirBack with Kafka Payment Events! 🚀📡💳");
});

const seatsRoutes = require('./routes/seatsRoutes');
const reservationsRoutes = require('./routes/reservationsRoutes');
const paymentEventsRoutes = require('./routes/paymentEventsRoutes');
const flightsRoutes = require('./routes/flightsRoutes');
const flightCartsRoutes = require('./routes/flightsCartsRoutes');

app.use(seatsRoutes);
app.use(reservationsRoutes);
app.use(paymentEventsRoutes);
app.use(flightsRoutes);
app.use(flightCartsRoutes);

const path = require('path');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const yaml = require('js-yaml');
const swaggerDocument = yaml.load(fs.readFileSync(path.join(__dirname, 'utils', 'reservations-api.yaml'), 'utf8'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`📚 API Documentation available at http://localhost:${PORT}/api-docs`);
  
  // Inicializar Kafka después de que el servidor esté listo
  setTimeout(async () => {
    await initializeKafka({
        topics: ['payment-events', 'reservation-events', 'flight-events'],
        delayMs: 2000
    });
  }, 10000); // Esperar 10 segundos para que Kafka esté completamente listo
});
