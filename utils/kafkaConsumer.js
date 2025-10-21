const { createConsumer } = require('./kafkaInitializer');

const topics = [
  'reservations.events',
];

async function runKafkaConsumer() {
  // Cambiá groupId cada vez que quieras “releer todo” desde cero
  const consumer = await createConsumer({ groupId: 'reservas-air-back-replay-' + Date.now() });

  // Suscribirse a todos los topics desde el principio
  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: true });
    console.log(`📡 Subscribed to topic: ${topic}`);
  }

  // Log al unirse al grupo
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
          // Soportar event_type y eventType
          const type = event.event_type || event.eventType;
          if (type === 'flights.flight.created') {
            const flightsController = require('../controllers/flightsController');
            let payload = event.payload;
            if (typeof payload === 'string') {
              try {
                payload = JSON.parse(payload);
              } catch (e) {
                console.error('Error parsing payload:', e, payload);
              }
            }
            const parseLocation = (input, time) => {
              let code = '';
              if (typeof input === 'object' && input !== null) {
                code = input.code || input.city || input;
              } else {
                code = input;
              }
              return {
                city: code === 'EZE' ? 'Buenos Aires' : 'Generic City',
                code: code,
                time: time || undefined
              };
            };
            let duration = null;
            let originTime = undefined;
            let destinationTime = undefined;
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
            } catch (e) {
              duration = null;
            }
            let aircraftModel = payload.aircraftModel;
            if (aircraftModel === 'A320') aircraftModel = 'E190';
            const flightData = {
              flightNumber: payload.flightNumber,
              origin: parseLocation(payload.origin, originTime),
              destination: parseLocation(payload.destination, destinationTime),
              aircraft: aircraftModel,
              aircraftModel: payload.flightId, // flightId goes into aircraftModel
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
          } else if (type === 'flights.flight.updated') {
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
            const flightsController = require('../controllers/flightsController');
            const statusMap = {
              'EN_HORA': 'ONTIME',
              'ONTIME': 'ONTIME',
              'DELAYED': 'DELAYED',
              'DEMORADO': 'DELAYED',
              'CANCELLED': 'CANCELLED',
              'CANCELADO': 'CANCELLED'
            };
            let mappedPayload = { ...payload };
            if (mappedPayload.newStatus && statusMap[mappedPayload.newStatus.toUpperCase()]) {
              mappedPayload.newStatus = statusMap[mappedPayload.newStatus.toUpperCase()];
            }
            if (mappedPayload.status && statusMap[mappedPayload.status.toUpperCase()]) {
              mappedPayload.status = statusMap[mappedPayload.status.toUpperCase()];
            }
            if (
              (mappedPayload.newStatus && mappedPayload.newStatus.toUpperCase() === 'CANCELLED') ||
              (mappedPayload.status && mappedPayload.status.toUpperCase() === 'CANCELLED')
            ) {
              const cancelReq = { params: { externalFlightId: mappedPayload.flightId } };
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
          } else if (type === 'search.cart.item.added') {
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
          } else if (type === 'reservations.reservation.created') {
            console.log('📅 Evento de reserva recibido:', event);
          } else if (type === 'payments.payment.created') {
            console.log('💰 Evento de pago recibido:', event);
          } else if (type === 'users.user.created') {
            console.log('👤 Evento de usuario recibido:', event);
          } else if (type === 'metrics.metric.created') {
            console.log('📈 Evento de métricas recibido:', event);
          } else if (type === 'core.ingress') {
            console.log('🧩 Evento de core.ingress recibido:', event);
          } else {
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
