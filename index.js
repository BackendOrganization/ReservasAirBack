const express = require("express");
const app = express();
const PORT = 3000;
const dotenv = require('dotenv').config();

const { connectRabbitMQ, consumePaymentEvents } = require('./utils/rabbitmq');

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Bienvenido a ReservasAirBack 🚀");
});

const asientosRoutes = require('./routes/asientosRoutes');
const reservasRoutes = require('./routes/reservasRoutes');
const testRabbit = require('./routes/testRabbit');

app.use(asientosRoutes);
app.use(reservasRoutes);
app.use(testRabbit);

(async () => {
  await connectRabbitMQ();
  consumePaymentEvents();
})();

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
