const reservationsModel = require('../models/reservationsModel');
const kafkaProducer = require('../utils/kafkaProducer'); // Nuevo import

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
    
    reservationsModel.createReservation(externalUserId, externalFlightId, seatIds, 'ARS', async (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Seat is already reserved' }); // 500
        }
        
        // 📨 Enviar evento de reserva creada exitosamente vía HTTP POST
        try {
            await kafkaProducer.sendReservationCreatedHttpEvent({
                reservationId: String(result.reservationId),
                userId: String(externalUserId),
                flightId: String(externalFlightId),
                amount: Number(result.totalAmount || result.totalPrice || 0),
                currency: 'ARS',
                reservedAt: new Date().toISOString()
            });
            console.log(`📨 Reservation created event sent via HTTP POST for reservation ${result.reservationId}`);
        } catch (httpError) {
            console.error('❌ Failed to send reservation created event via HTTP POST:', httpError);
            // No fallar la respuesta por error de HTTP
        }
        
        res.status(201).json(result); // 201
    });
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
        
        // Publicar evento reservation.updated con PENDING_REFUND
        try {
            await eventsProducer.sendReservationUpdatedEvent({
                reservationId: reservationId,
                newStatus: 'PENDING_REFUND',
                reservationDate: result.reservationDate,
                flightDate: result.flightDate
            });
            console.log(`[KAFKA] Event reservation.updated (PENDING_REFUND) published for reservation ${reservationId}`);
        } catch (eventErr) {
            console.error('[KAFKA] Error publishing reservation.updated event:', eventErr);
            // No fallar la respuesta si el evento falla
        }
        
        return res.status(200).json(result);
    });
};

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
