const express = require("express");
const app = express();
const PORT = 3000;
const dotenv = require('dotenv').config();



app.use(express.json());

app.get("/", (req, res) => {
  res.send("Welcome to ReservasAirBack 🚀");
});


const seatsRoutes = require('./routes/seatsRoutes');
const reservationsRoutes = require('./routes/reservationsRoutes');
const paymentEventsRoutes = require('./routes/paymentEventsRoutes');
const flightsRoutes = require('./routes/flightsRoutes');

app.use(seatsRoutes);
app.use(reservationsRoutes);
app.use(paymentEventsRoutes);
app.use(flightsRoutes);



app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
