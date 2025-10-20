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
            
            // 📨 Enviar evento de reserva fallida a Kafka
            try {
                await kafkaProducer.sendReservationEvent('RESERVATION_FAILED', {
                    externalUserId,
                    externalFlightId,
                    seatIds,
                    error: err.message,
                    reason: 'SEAT_ALREADY_RESERVED'
                });
                console.log('📨 Reservation failed event sent to Kafka');
            } catch (kafkaError) {
                console.error('❌ Failed to send reservation failed event to Kafka:', kafkaError);
            }
            
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
        if (result) {
            // 📨 Enviar evento de cancelación a Kafka
            try {
                await kafkaProducer.sendReservationEvent('RESERVATION_CANCELLED', {
                    reservationId,
                    cancelledBy: 'USER',
                    reason: 'USER_REQUESTED'
                });
                console.log(`📨 Reservation cancelled event sent to Kafka for reservation ${reservationId}`);
            } catch (kafkaError) {
                console.error('❌ Failed to send reservation cancelled event to Kafka:', kafkaError);
            }
            
            return res.status(200).json(result);
        }
        
        if (err) {
            console.error(err);
            
            // 📨 Enviar evento de error en cancelación a Kafka
            try {
                await kafkaProducer.sendReservationEvent('RESERVATION_CANCELLATION_FAILED', {
                    reservationId,
                    error: err.message,
                    reason: 'CANCELLATION_ERROR'
                });
                console.log('📨 Reservation cancellation failed event sent to Kafka');
            } catch (kafkaError) {
                console.error('❌ Failed to send cancellation failed event to Kafka:', kafkaError);
            }
            
            return res.status(500).json({ error: 'Error cancelling reservation', details: err });
        }
        
        res.status(500).json({ error: 'Unknown error cancelling reservation' });
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
