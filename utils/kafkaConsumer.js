const { createConsumer } = require('./kafkaInitializer');

const topics = ['reservations.events'];

async function runKafkaConsumer() {
  const consumer = await createConsumer({ groupId: 'reservas-air-back-replay-' + Date.now() });

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: true });
    console.log(`📡 Subscribed to topic: ${topic}`);
  }

  consumer.on(consumer.events.GROUP_JOIN, e => {
    console.log(`👥 Joined group ${e.payload.groupId} as ${e.payload.memberId}`);
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const key = message.key?.toString() || '';
      const value = message.value?.toString() || '';

      console.log(`💬 [${topic}] ${key ? key + ' -> ' : ''}${value}`);

      try {
        const parsed = JSON.parse(value);
        const events = Array.isArray(parsed) ? parsed : [parsed];

        for (const event of events) {
          const type = event.event_type || event.eventType;

          // ==============================================================
          // 🛫 EVENTO: FLIGHT CREATED
          // ==============================================================
          if (type === 'flights.flight.created') {
            const flightsController = require('../controllers/flightsController');
            let payload = event.payload;

            if (typeof payload === 'string') {
              try {
                payload = JSON.parse(payload);
              } catch (e) {
                console.error('Error parsing payload:', e, payload);
                continue;
              }
            }

            const parseLocation = (input, time) => {
              let code = typeof input === 'object' && input ? (input.code || input.city || input) : input;
              return {
                city: code === 'EZE' ? 'Buenos Aires' : 'Generic City',
                code,
                time: time || undefined
              };
            };

            let duration = null;
            let originTime, destinationTime;
            try {
              const dep = new Date(payload.departureAt);
              const arr = new Date(payload.arrivalAt);
              if (!isNaN(dep) && !isNaN(arr)) {
                const totalMinutes = Math.round((arr - dep) / 60000);
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;
                duration = `${hours}h ${minutes.toString().padStart(2, '0')}m`;
                originTime = `${dep.getUTCHours().toString().padStart(2, '0')}`;
                destinationTime = `${arr.getUTCHours().toString().padStart(2, '0')}`;
              }
            } catch {
              duration = null;
            }

            // ✅ Guarda flightId en aircraftModel literalmente
            const flightData = {
              flightNumber: payload.flightNumber,
              origin: parseLocation(payload.origin, originTime),
              destination: parseLocation(payload.destination, destinationTime),
              aircraft: payload.aircraftModel || 'UNKNOWN', // modelo real del avión
              aircraftModel: String(payload.flightId),      // 🔥 guarda el flightId (ej: "56")
              flightDate: payload.departureAt.split('T')[0],
              duration,
            };

            const req = { body: flightData };
            const res = {
              status: (code) => ({ json: (obj) => console.log(`[IngestFlight][${code}]`, obj) }),
              json: (obj) => console.log('[IngestFlight][json]', obj),
            };

            console.log('🛬 Procesando vuelo creado:', flightData);
            await flightsController.ingestFlight(req, res);
          }

          // ==============================================================
          // 🛠️ EVENTO: FLIGHT UPDATED
          // ==============================================================
          else if (type === 'flights.flight.updated') {
            const flightsController = require('../controllers/flightsController');
            let payload = event.payload;

            if (typeof payload === 'string') {
              try {
                payload = JSON.parse(payload);
              } catch (e) {
                console.error('Error parsing flight update payload:', e, payload);
                payload = {};
              }
            }

            console.log('✈️ Actualizar vuelo:', payload);

            const statusMap = {
              'EN_HORA': 'ONTIME',
              'ONTIME': 'ONTIME',
              'DELAYED': 'DELAYED',
              'DEMORADO': 'DELAYED',
              'CANCELLED': 'CANCELLED',
              'CANCELADO': 'CANCELLED'
            };

            // Mapeo correcto de campos para update
            let mappedPayload = {};
            if (payload.flightId) {
              mappedPayload.aircraftModel = String(payload.flightId);
            }
            if (payload.newStatus) {
              // Mapear a flightStatus y normalizar
              const normalizeStatus = (s) => (s && statusMap[s.toUpperCase()]) || s;
              mappedPayload.flightStatus = normalizeStatus(payload.newStatus);
            }
            if (payload.newDepartureAt) {
              mappedPayload.newDepartureAt = payload.newDepartureAt;
            }
            if (payload.newArrivalAt) {
              mappedPayload.newArrivalAt = payload.newArrivalAt;
            }

            // Si el vuelo fue cancelado
            if (mappedPayload.flightStatus && mappedPayload.flightStatus === 'CANCELLED') {
              const cancelReq = { params: { aircraftModel: mappedPayload.aircraftModel } };
              const cancelRes = {
                status: (code) => ({ json: (obj) => console.log(`[CancelFlight][${code}]`, obj) }),
                json: (obj) => console.log('[CancelFlight][json]', obj),
              };
              flightsController.cancelFlightReservations(cancelReq, cancelRes);
            } else {
              const updateReq = { body: mappedPayload };
              const updateRes = {
                status: (code) => ({ json: (obj) => console.log(`[UpdateFlight][${code}]`, obj) }),
                json: (obj) => console.log('[UpdateFlight][json]', obj),
              };
              flightsController.updateFlightFields(updateReq, updateRes);
            }
          }

          // ==============================================================
          // 🛒 EVENTO: CART ITEM ADDED
          // ==============================================================
          else if (type === 'search.cart.item.added') {
            const flightCartsController = require('../controllers/flightCartsController');
            let payload = event.payload;
            if (typeof payload === 'string') {
              try {
                payload = JSON.parse(payload);
              } catch (e) {
                console.error('Error parsing cart payload:', e, payload);
                payload = {};
              }
            }

            const { userId, flightId, addedAt } = payload;
            const req = { body: { externalUserId: userId, flights: flightId } };
            const res = {
              status: (code) => ({ json: (obj) => console.log(`[Cart][${code}]`, obj) }),
              json: (obj) => console.log('[Cart][json]', obj),
            };
            console.log('🛒 Agregando vuelo al carrito:', { userId, flightId, addedAt });
            flightCartsController.addFlightToCart(req, res);
          }

          // ==============================================================
          // 📅 EVENTO: RESERVATION CREATED
          // ==============================================================
          else if (type === 'reservations.reservation.created') {
            console.log('📅 Evento de reserva recibido:', event);
          }

          // ==============================================================
          // 💰 EVENTO: PAYMENT CREATED
          // ==============================================================
          else if (type === 'payments.payment.created') {
            console.log('💰 Evento de pago recibido:', event);
          }

          // ==============================================================
          // 👤 EVENTO: USER CREATED
          // ==============================================================
          else if (type === 'users.user.created') {
            console.log('👤 Evento de usuario recibido:', event);
          }

          // ==============================================================
          // 📈 EVENTO: METRIC CREATED
          // ==============================================================
          else if (type === 'metrics.metric.created') {
            console.log('📈 Evento de métricas recibido:', event);
          }

          // ==============================================================
          // 🧩 CORE INGRESO
          // ==============================================================
          else if (type === 'core.ingress') {
            console.log('🧩 Evento de core.ingress recibido:', event);
          }

          // ==============================================================
          // 🚫 EVENTO NO RECONOCIDO
          // ==============================================================
          else {
            console.log('Evento no soportado:', type);
          }
        }
      } catch (e) {
        console.warn(`⚠️ Error procesando mensaje de ${topic}:`, e.message);
      }
    },
  });

  console.log('✅ Conectado y escuchando todos los topics en el broker externo. (Ctrl+C para salir)');
}

runKafkaConsumer().catch(e => {
  console.error('❌ Error en Kafka:', e);
  process.exit(1);
});
