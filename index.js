const express = require("express");
const app = express();
const PORT = 3000;
const dotenv = require('dotenv').config();
const cors = require('cors'); // <-- agrega esta línea

app.use(cors()); // <-- agrega esta línea
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Welcome to ReservasAirBack  TATAATATA🚀");
});


const seatsRoutes = require('./routes/seatsRoutes');
const reservationsRoutes = require('./routes/reservationsRoutes');
const paymentEventsRoutes = require('./routes/paymentEventsRoutes');
const flightsRoutes = require('./routes/flightsRoutes');

app.use(seatsRoutes);
app.use(reservationsRoutes);
app.use(paymentEventsRoutes);
app.use(flightsRoutes);

const path = require('path');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const yaml = require('js-yaml');
const swaggerDocument = yaml.load(fs.readFileSync(path.join(__dirname, 'utils', 'reservations-api.yaml'), 'utf8'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));



app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
