const paymentEventsModel = require('../models/paymentEventsModel');
const reservationsModel = require('../models/reservationsModel');
const seatsModel = require('../models/seatsModel');
const eventsProducer = require('../utils/kafkaProducer');

exports.confirmPayment = (req, res) => {
    const { paymentStatus, reservationId, externalUserId } = req.body;
    console.log('[confirmPayment] Datos recibidos:', { paymentStatus, reservationId, externalUserId });
    if (!paymentStatus || !reservationId || !externalUserId) {
        return res.status(400).json({ error: 'Missing required fields: paymentStatus, reservationId, externalUserId' }); // 400
    }
    if (paymentStatus !== 'SUCCESS') {
        return res.status(400).json({ error: 'Only paymentStatus SUCCESS is allowed for confirmation.' }); // 400
    }
    let responded = false;
    paymentEventsModel.confirmPayment(paymentStatus, reservationId, externalUserId, async (err, result) => {
        if (responded) return;
        responded = true;
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error confirming payment' }); // 500
        }
        if (result && result.success === false) {
            return res.status(400).json({ error: result.message }); // 400
        }
        
        console.log('[confirmPayment] Result from model:', result);
        
        // Publicar evento de actualización de reserva
        try {
            console.log('[confirmPayment] Intentando publicar evento de reserva actualizada...');
            await eventsProducer.sendReservationUpdatedEvent({
                reservationId: String(reservationId),
                newStatus: 'PAID',
                reservationDate: result.reservationDate,
                flightDate: result.flightDate
            });
            console.log('✅ Reservation updated event published for PAID status');
        } catch (eventError) {
            console.error('❌ Error publishing reservation updated event:', eventError);
            // No fallar la respuesta aunque falle el evento
        }
        
        res.status(200).json(result); // 200
    });
};

exports.cancelPayment = (req, res) => {
    const { reservationId, externalUserId } = req.body;
    if (!reservationId || !externalUserId) {
        return res.status(400).json({ error: 'Missing required fields: reservationId, externalUserId' }); // 400
    }
    paymentEventsModel.cancelPayment(reservationId, externalUserId, async (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error cancelling payment' }); // 500
        }
        
        // Publicar evento de actualización de reserva
        try {
            await eventsProducer.sendReservationUpdatedEvent({
                reservationId: String(reservationId),
                newStatus: 'CANCELLED',
                reservationDate: result.reservationDate,
                flightDate: result.flightDate
            });
            console.log('✅ Reservation updated event published for CANCELLED status');
        } catch (eventError) {
            console.error('❌ Error publishing reservation updated event:', eventError);
            // No fallar la respuesta aunque falle el evento
        }
        
        res.status(200).json(result); // 200
    });
};

exports.failPayment = (req, res) => {
    const paymentData = req.body;
    if (!paymentData.paymentStatus || !paymentData.reservationId || !paymentData.externalUserId) {
        return res.status(400).json({ error: 'Missing required payment data' }); // 400
    }
    paymentEventsModel.createPaymentEventAndFailReservation(paymentData, async (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Error processing payment event', details: err }); // 500
        }
        
        // Publicar evento de actualización de reserva
        try {
            await eventsProducer.sendReservationUpdatedEvent({
                reservationId: String(paymentData.reservationId),
                newStatus: 'FAILED',
                reservationDate: result.reservationDate,
                flightDate: result.flightDate
            });
            console.log('✅ Reservation updated event published for FAILED status');
        } catch (eventError) {
            console.error('❌ Error publishing reservation updated event:', eventError);
            // No fallar la respuesta aunque falle el evento
        }
        
        res.status(201).json({ message: 'Payment event created and reservation marked as FAILED', ...result }); // 201
    });
};

// Endpoint GET para consultar el estado de pago de una reserva
// GET /payment/notify/:reservationId
// Devuelve: { reservationId: "123", success: true } si PAID
// Devuelve: { reservationId: "123", success: false } si FAILED
exports.notifyPaymentStatus = (req, res) => {
    const reservationId = req.params.reservationId;
    
    if (!reservationId) {
        return res.status(400).json({ error: 'Missing reservationId' });
    }
    
    const db = require('../config/db');
    const query = 'SELECT status FROM reservations WHERE reservationId = ? LIMIT 1';
    
    db.query(query, [reservationId], (err, results) => {
        if (err) {
            console.error('[notifyPaymentStatus] Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!results || results.length === 0) {
            return res.status(404).json({ 
                reservationId: reservationId,
                success: false,
                error: 'Reservation not found'
            });
        }
        
        const status = results[0].status;
        const success = (status === 'PAID');
        
        console.log(`[notifyPaymentStatus] Reservation ${reservationId} status: ${status}, success: ${success}`);
        
        return res.status(200).json({ 
            reservationId: reservationId,
            success: success
        });
    });
};

// Endpoint GET para consultar si el pago falló
// GET /payment/notify/failed/:reservationId
// Devuelve: { reservationId: "123", success: true } si FAILED
// Devuelve: { reservationId: "123", success: false } si NO está FAILED
exports.notifyPaymentFailed = (req, res) => {
    const reservationId = req.params.reservationId;
    
    if (!reservationId) {
        return res.status(400).json({ error: 'Missing reservationId' });
    }
    
    const db = require('../config/db');
    const query = 'SELECT status FROM reservations WHERE reservationId = ? LIMIT 1';
    
    db.query(query, [reservationId], (err, results) => {
        if (err) {
            console.error('[notifyPaymentFailed] Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!results || results.length === 0) {
            return res.status(404).json({ 
                reservationId: reservationId,
                success: false,
                error: 'Reservation not found'
            });
        }
        
        const status = results[0].status;
        const success = (status === 'FAILED');
        
        console.log(`[notifyPaymentFailed] Reservation ${reservationId} status: ${status}, success: ${success}`);
        
        return res.status(200).json({ 
            reservationId: reservationId,
            success: success
        });
    });
};
