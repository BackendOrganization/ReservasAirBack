const { createConsumer } = require('./kafkaInitializer');

const topics = [
  'flights.events'
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
          // --- FLIGHTS.EVENTS ---
          if (topic === 'flights.events') {
            const flightsController = require('../controllers/flightsController');

            if (event.event_type === 'flights.flight.created') {
              const payload = event.payload;

              // Nuevo parseLocation para city, code y time
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

              // Mapear temporalmente A320 como E190
              let aircraftModel = payload.aircraftModel;
              if (aircraftModel === 'A320') aircraftModel = 'E190';

              const flightData = {
                id: payload.flightId,
                flightNumber: payload.flightNumber,
                origin: parseLocation(payload.origin, originTime),
                destination: parseLocation(payload.destination, destinationTime),
                aircraft: aircraftModel,
                aircraftModel: aircraftModel,
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

            else if (event.event_type === 'flights.flight.updated') {
              console.log('✈️ Actualizar vuelo:', event.payload);
              // Mapear status conocidos a los valores del ENUM
              const statusMap = {
                'EN_HORA': 'ONTIME',
                'ONTIME': 'ONTIME',
                'DELAYED': 'DELAYED',
                'DEMORADO': 'DELAYED',
                'CANCELLED': 'CANCELLED',
                'CANCELADO': 'CANCELLED'
              };
              let mappedPayload = { ...event.payload };
              if (mappedPayload.newStatus && statusMap[mappedPayload.newStatus.toUpperCase()]) {
                mappedPayload.newStatus = statusMap[mappedPayload.newStatus.toUpperCase()];
              }
              if (mappedPayload.status && statusMap[mappedPayload.status.toUpperCase()]) {
                mappedPayload.status = statusMap[mappedPayload.status.toUpperCase()];
              }
              // Si el status es CANCELLED, usar la función de cancelación
              if (
                (mappedPayload.newStatus && mappedPayload.newStatus.toUpperCase() === 'CANCELLED') ||
                (mappedPayload.status && mappedPayload.status.toUpperCase() === 'CANCELLED')
              ) {
                // Llama a cancelFlightReservations
                const cancelReq = { params: { externalFlightId: mappedPayload.flightId } };
                const cancelRes = {
                  status: (code) => ({ json: (obj) => console.log(`[CancelFlight][${code}]`, obj) }),
                  json: (obj) => console.log('[CancelFlight][json]', obj),
                };
                flightsController.cancelFlightReservations(cancelReq, cancelRes);
              } else {
                // Llama a updateFlightFields
                const updateReq = { body: mappedPayload };
                const updateRes = {
                  status: (code) => ({ json: (obj) => console.log(`[UpdateFlight][${code}]`, obj) }),
                  json: (obj) => console.log('[UpdateFlight][json]', obj),
                };
                flightsController.updateFlightFields(updateReq, updateRes);
              }
            }
          }

          // --- OTROS TOPICS ---
          else if (topic === 'reservations.events') {
            console.log('📅 Evento de reserva recibido:', event);
          } else if (topic === 'payments.events') {
            console.log('💰 Evento de pago recibido:', event);
          } else if (topic === 'users.events') {
            console.log('👤 Evento de usuario recibido:', event);
          } else if (topic === 'metrics.events') {
            console.log('📈 Evento de métricas recibido:', event);
          } else if (topic === 'core.ingress') {
            console.log('🧩 Evento de core.ingress recibido:', event);
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
