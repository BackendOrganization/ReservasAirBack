const reservationsModel = require('../models/reservationsModel');
const kafkaProducer = require('../utils/kafkaProducer'); // Nuevo import
const flightsModel = require('../models/flightsModel');

exports.getReservationsByExternalUserId = (req, res) => {
    const externalUserId = req.params.externalUserId;
    if (!externalUserId) {
        return res.status(400).json({ error: 'Missing required parameter: externalUserId' }); // 400
    }
    reservationsModel.getReservationsByExternalUserId(externalUserId, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error fetching reservations' }); // 500
        }
        res.status(200).json(results); // 200
    });
};

exports.changeSeat = (req, res) => {
    const reservationId = req.body.reservationId;
    const oldSeatId = req.body.oldSeatId;
    const newSeatId = req.body.newSeatId;
    if (!reservationId || !oldSeatId || !newSeatId) {
        return res.status(400).json({ error: 'Missing required fields' }); // 400
    }
    reservationsModel.changeSeat(reservationId, oldSeatId, newSeatId, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error changing seat for reservation' }); // 500
        }
        res.status(200).json(result); // 200
    });
};

exports.createReservation = async (req, res) => {
    const externalFlightId = req.params.externalFlightId;
    const externalUserId = req.params.externalUserId;
    const seatIds = req.body.seatIds;

    if (!externalUserId || !externalFlightId || !Array.isArray(seatIds) || seatIds.length === 0) {
        return res.status(400).json({ error: 'Missing required fields: externalUserId (URL), externalFlightId (URL), seatIds (array)' }); // 400
    }

    try {
        // Obtener currency basado en externalFlightId
        const flightData = await new Promise((resolve, reject) => {
            flightsModel.getFlightByExternalFlightId(externalFlightId, (err, data) => {
                if (err) return reject(err);
                resolve(data);
            });
        });

        if (!flightData) {
            return res.status(404).json({ error: 'Flight not found' });
        }

        const currency = flightData.currency;

        console.log('Debugging createReservation call:', {
            externalUserId,
            externalFlightId,
            seatIds,
            currency
        });

        reservationsModel.createReservation(externalUserId, externalFlightId, seatIds, async (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Seat is already reserved' }); // 500
            }

            // 📨 Enviar evento de reserva creada exitosamente vía HTTP POST
            try {
                await kafkaProducer.sendReservationCreatedHttpEvent({
                    reservationId: String(result.reservationId),
                    userId: String(externalUserId),
                    flightId: String(result.aircraftModel || externalFlightId),  // 👈 Usar aircraftModel
                    amount: Number(result.totalAmount || result.totalPrice || 0),
                    currency: currency, // Usar currency dinámico
                    reservedAt: new Date().toISOString()
                });
                console.log(`📨 Reservation created event sent via HTTP POST for reservation ${result.reservationId}`);
            } catch (httpError) {
                console.error('❌ Failed to send reservation created event via HTTP POST:', httpError);
                // No fallar la respuesta por error de HTTP
            }

            res.status(201).json(result); // 201
        });
    } catch (fetchError) {
        console.error('❌ Failed to fetch flight data for currency:', fetchError);
        return res.status(500).json({ error: 'Failed to fetch flight data for currency' }); // 500
    }
};

exports.cancelReservation = async (req, res) => {
    const reservationId = req.params.reservationId;
    if (!reservationId) {
        return res.status(400).json({ error: 'Missing required field: reservationId (URL)' }); // 400
    }
    
    reservationsModel.cancelReservation(reservationId, async (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error cancelling reservation' }); // 500
        }
        
        if (!result || !result.success) {
            return res.status(400).json(result || { error: 'Failed to cancel reservation' }); // 400
        }
        
        // Si ya estaba cancelada, devolver éxito sin publicar evento
        if (result.alreadyCancelled) {
            console.log(`[INFO] Reservation ${reservationId} is already in PENDING_REFUND status. No event published.`);
            return res.status(200).json(result);
        }
        
        // Publicar evento reservation.updated con PENDING_REFUND (solo si es nueva cancelación)
        try {
            console.log('[DEBUG] Result from model:', JSON.stringify(result));
            
            if (!result.reservationDate || !result.flightDate) {
                console.error('[KAFKA] Missing dates in result:', { 
                    reservationDate: result.reservationDate, 
                    flightDate: result.flightDate 
                });
                throw new Error('Missing reservationDate or flightDate in model result');
            }
            
            await kafkaProducer.sendReservationUpdatedEvent({
                reservationId: reservationId,
                newStatus: 'PENDING_REFUND',
                reservationDate: result.reservationDate instanceof Date 
                    ? result.reservationDate.toISOString() 
                    : new Date(result.reservationDate).toISOString(),
                flightDate: result.flightDate instanceof Date 
                    ? result.flightDate.toISOString() 
                    : new Date(result.flightDate).toISOString()
            });
            console.log(`[KAFKA] Event reservation.updated (PENDING_REFUND) published for reservation ${reservationId}`);
        } catch (eventErr) {
            console.error('[KAFKA] Error publishing reservation.updated event:', eventErr);
            // No fallar la respuesta si el evento falla
        }
        
        return res.status(200).json(result);
    });
};//fixing

exports.getFullReservationsByExternalUserId = (req, res) => {
    const externalUserId = req.params.externalUserId;
    if (!externalUserId) {
        return res.status(400).json({ error: 'Missing required parameter: externalUserId' }); // 400
    }
    reservationsModel.getFullReservationsByExternalUserId(externalUserId, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error fetching full reservation data' }); // 500
        }
        res.status(200).json(results); // 200
    });
};
