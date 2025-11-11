const { createConsumer } = require('./kafkaInitializer');

const topics = ['reservations.events'];

async function runKafkaConsumer() {
  // Usar un groupId fijo para mantener el offset entre reinicios
  const consumer = await createConsumer({ groupId: 'reservas-air-back-consumer' });

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

            const airportMappings = {
              EZE: { city: 'Buenos Aires', name: 'Ministro Pistarini' },
              AEP: { city: 'Buenos Aires', name: 'Aeroparque' },
              SCL: { city: 'Santiago', name: 'Arturo Merino Benítez' },
              GRU: { city: 'São Paulo', name: 'Guarulhos' },
              MIA: { city: 'Miami', name: 'International' },
              MAD: { city: 'Madrid', name: 'Barajas' },
              BCN: { city: 'Barcelona', name: 'El Prat' },
              FCO: { city: 'Rome', name: 'Fiumicino' },
              JFK: { city: 'New York', name: 'JFK' },
              LAX: { city: 'Los Angeles', name: 'LAX' },
              ATL: { city: 'Atlanta', name: 'Hartsfield-Jackson' },
              CDG: { city: 'París', name: 'Charles de Gaulle' },
              MEX: { city: 'Ciudad de México', name: 'Benito Juárez' },
              AMS: { city: 'Ámsterdam', name: 'Schiphol' },
              SFO: { city: 'San Francisco', name: 'International' },
              NRT: { city: 'Tokio', name: 'Narita' }
            };

            const parseLocation = (input, time) => {
              let code = typeof input === 'object' && input ? (input.code || input.city || input) : input;
              const mapping = airportMappings[code] || { city: 'Generic City', name: 'Unknown' };
              return {
                city: mapping.city,
                name: mapping.name,
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
                originTime = `${dep.getUTCHours().toString().padStart(2, '0')}:${dep.getUTCMinutes().toString().padStart(2, '0')}`;
                destinationTime = `${arr.getUTCHours().toString().padStart(2, '0')}:${arr.getUTCMinutes().toString().padStart(2, '0')}`;
              }
            } catch {
              duration = null;
            }

            // Verificar si price y currency están presentes
            const price = payload.price || null;
            const currency = payload.currency || null;

            if (!price || !currency) {
              console.warn('⚠️ Flight created event missing price or currency:', { price, currency });
            }

            // Mapeo de estados
            const statusMap = {
              'EN_HORA': 'ONTIME',
              'ONTIME': 'ONTIME',
              'DELAYED': 'DELAYED',
              'DEMORADO': 'DELAYED',
              'CANCELLED': 'CANCELLED',
              'CANCELADO': 'CANCELLED'
            };
            let flightStatus = payload.flightStatus;
            if (!flightStatus && payload.status) {
              const normalized = payload.status.toUpperCase();
              flightStatus = statusMap[normalized] || normalized;
            }
            if (!flightStatus) flightStatus = 'ONTIME';
            const flightData = {
              flightNumber: payload.flightNumber,
              origin: parseLocation(payload.origin, originTime),
              destination: parseLocation(payload.destination, destinationTime),
              aircraft: payload.aircraftModel || 'UNKNOWN', 
              aircraftModel: String(payload.flightId),      
              flightDate: payload.departureAt.split('T')[0],
              duration,
              price,
              currency,
              flightStatus: flightStatus
            };

            const req = { body: flightData };
            const res = {
              status: (code) => ({ json: (obj) => console.log(`[IngestFlight][${code}]`, obj) }),
              json: (obj) => console.log('[IngestFlight][json]', obj),
            };

            console.log('🛬 Procesando vuelo creado:', flightData);
            await flightsController.ingestFlight(req, res);
          }

       //Evento: flight updated
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

            // Mapeo para determinar si es cancelación
            const normalizeStatus = (s) => (s && statusMap[s.toUpperCase()]) || s;
            const mappedStatus = payload.newStatus ? normalizeStatus(payload.newStatus) : null;

            // Si el vuelo fue cancelado
            if (mappedStatus === 'CANCELLED') {
              const aircraftModel = String(payload.flightId);
              const cancelReq = { params: { aircraftModel } };
              const cancelRes = {
                status: (code) => ({ json: (obj) => console.log(`[CancelFlight][${code}]`, obj) }),
                json: (obj) => console.log('[CancelFlight][json]', obj),
              };
              flightsController.cancelFlightReservations(cancelReq, cancelRes);
            } else {
              // Pasar el payload original al controller, él hará el mapeo
              const updateReq = { body: payload };
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
            // Buscar el externalFlightId real a partir del aircraftModel (flightId recibido)
            const flightsModel = require('../models/flightsModel');
            const req = { body: {} };
            const res = {
              status: (code) => ({ json: (obj) => console.log(`[Cart][${code}]`, obj) }),
              json: (obj) => console.log('[Cart][json]', obj),
            };
            console.log('🛒 Buscando externalFlightId para aircraftModel:', flightId);
            flightsModel.getFlightByAircraftModel(flightId, (err, flight) => {
              if (err || !flight) {
                console.error('❌ No se encontró el vuelo para aircraftModel:', flightId, err);
                return res.status(404).json({ error: 'Vuelo no encontrado para agregar al carrito' });
              }
              req.body = { externalUserId: userId, flights: flight.externalFlightId };
              console.log('🛒 Agregando vuelo al carrito:', { userId, externalFlightId: flight.externalFlightId, addedAt });
              flightCartsController.addFlightToCart(req, res);
            });
          }

          // ==============================================================
          // 📅 EVENTO: RESERVATION CREATED
          // ==============================================================
          else if (type === 'reservations.reservation.created') {
            console.log('📅 Evento de reserva recibido:', event);
          }

          // ==============================================================
          // 💰 EVENTO: PAYMENT UPDATED
          // ==============================================================
          else if ( type === 'payments.payment.status_updated') {
            console.log('💰 Evento de pago actualizado recibido:', event);
            const paymentEventsController = require('../controllers/paymentEventsController');
            
            let payload = event.payload;
            if (typeof payload === 'string') {
              try {
                payload = JSON.parse(payload);
              } catch (e) {
                console.error('Error parsing payment payload:', e, payload);
                continue;
              }
            }

            const { reservationId, userId, status, amount, currency } = payload;
            
            if (!reservationId || !userId || !status || !amount || !currency) {
              console.error('❌ Payload de pago incompleto:', payload);
              continue;
            }

            console.log(`💳 Procesando pago: reservationId=${reservationId}, status=${status}, amount=${amount}, currency=${currency}`);

            // Procesar de forma SÍNCRONA usando Promise
            await new Promise((resolve, reject) => {
              // Mock req/res para usar los controllers
              const req = { body: {} };
              const res = {
                status: (code) => ({
                  json: (obj) => {
                    if (code >= 400) {
                      console.error(`[PaymentEvent][${code}]`, obj);
                    } else {
                      console.log(`[PaymentEvent][${code}]`, obj);
                    }
                    resolve(); // Resolver cuando termina
                  }
                }),
                json: (obj) => {
                  console.log('[PaymentEvent][json]', obj);
                  resolve(); // Resolver cuando termina
                }
              };

              // Procesar según el estado del pago
              // Estados contemplados: SUCCESS, FAILURE, EXPIRED, REFUND (PENDING se ignora)
              if (status === 'SUCCESS' || status === 'PAID') {
                req.body = {
                  paymentStatus: 'SUCCESS',
                  reservationId: reservationId,
                  externalUserId: userId,
                  amount: amount,
                  currency: currency
                };
                console.log('✅ Confirmando pago vía controller...');
                paymentEventsController.confirmPayment(req, res);
              } 
              else if (status === 'FAILURE' || status === 'FAILED' || status === 'REJECTED') {
                req.body = {
                  paymentStatus: 'FAILED',
                  reservationId: reservationId,
                  externalUserId: userId,
                  amount: amount,
                  currency: currency
                };
                console.log('❌ Marcando pago como fallido vía controller...');
                paymentEventsController.failPayment(req, res);
              }
              else if (status === 'EXPIRED') {
                req.body = {
                  paymentStatus: 'FAILED',
                  reservationId: reservationId,
                  externalUserId: userId,
                  amount: amount,
                  currency: currency
                };
                console.log('⏰ Marcando pago como expirado (fallido) vía controller...');
                paymentEventsController.failPayment(req, res);
              }
              else if (status === 'REFUND' || status === 'REFUNDED') {
                req.body = {
                  paymentStatus: 'REFUND',
                  reservationId: reservationId,
                  externalUserId: userId,
                  amount: amount,
                  currency: currency
                };
                console.log('💸 Procesando reembolso vía controller...');
                paymentEventsController.cancelPayment(req, res);
              }
              else if (status === 'PENDING') {
                console.log(`⏳ Estado PENDING ignorado para reservationId=${reservationId}`);
                resolve(); // Resolver inmediatamente, no se procesa PENDING
              }
              else {
                console.log(`⚠️ Estado de pago no reconocido: ${status}`);
                resolve(); // Resolver inmediatamente si no se reconoce
              }
            });
            
            console.log(`✅ Evento de pago procesado completamente para reservationId=${reservationId}`);
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
  
  // Manejo de desconexiones para reconectar automáticamente
  consumer.on(consumer.events.DISCONNECT, () => {
    console.warn('⚠️ Consumer desconectado. Intentando reconectar...');
  });

  consumer.on(consumer.events.CONNECT, () => {
    console.log('🔗 Consumer reconectado exitosamente');
  });
}

// Iniciar el consumer con manejo de errores y reintentos
async function startConsumerWithRetry(retries = 5, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🚀 Intento ${i + 1} de iniciar Kafka consumer...`);
      await runKafkaConsumer();
      console.log('✅ Kafka consumer en ejecución');
      break; // Si tiene éxito, salir del loop
    } catch (e) {
      console.error(`❌ Error en Kafka (intento ${i + 1}/${retries}):`, e.message);
      if (i < retries - 1) {
        console.log(`⏳ Reintentando en ${delay / 1000} segundos...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('❌ No se pudo iniciar el consumer después de todos los intentos');
        // No hacer process.exit() para que Railway mantenga el servidor HTTP activo
      }
    }
  }
}

// Iniciar con reintentos
startConsumerWithRetry();
