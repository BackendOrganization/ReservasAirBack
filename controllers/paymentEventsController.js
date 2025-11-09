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
    console.log('[cancelPayment] Request body:', req.body);
    console.log('[cancelPayment] Extracted values:', { reservationId, externalUserId });
    
    if (!reservationId || !externalUserId) {
        console.error('[cancelPayment] ❌ Missing required fields:', { reservationId, externalUserId });
        return res.status(400).json({ error: 'Missing required fields: reservationId, externalUserId' }); // 400
    }
    
    console.log('[cancelPayment] ✅ Calling model with:', { reservationId, externalUserId });
    paymentEventsModel.cancelPayment(reservationId, externalUserId, async (err, result) => {
        if (err) {
            console.error('[cancelPayment] ❌ Model error:', err);
            return res.status(500).json({ error: 'Error cancelling payment' }); // 500
        }
        
        console.log('[cancelPayment] ✅ Model result:', result);
        
        // Verificar si el modelo retornó success: false
        if (result && result.success === false) {
            console.warn('[cancelPayment] ⚠️ Model returned success: false -', result.message);
            return res.status(400).json({ error: result.message });
        }
        
        // Publicar evento de actualización de reserva
        try {
            console.log('[cancelPayment] 📤 Publishing reservation.updated event...');
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
    console.log('[failPayment] Datos recibidos:', paymentData);

    if (!paymentData.paymentStatus || !paymentData.reservationId || !paymentData.externalUserId) {
        console.error('[failPayment] ❌ Faltan datos requeridos:', paymentData);
        return res.status(400).json({ error: 'Missing required payment data' }); // 400
    }

    console.log('[failPayment] Validando estado actual de la reserva...');
    const db = require('../config/db');
    const query = 'SELECT status FROM reservations WHERE reservationId = ? LIMIT 1';

    db.query(query, [paymentData.reservationId], (err, results) => {
        if (err) {
            console.error('[failPayment] ❌ Error en la base de datos:', err);
            return res.status(500).json({ error: 'Database error' }); // 500
        }

        if (!results || results.length === 0) {
            console.warn('[failPayment] ⚠️ Reserva no encontrada:', paymentData.reservationId);
            return res.status(404).json({ error: 'Reservation not found' }); // 404
        }

        const currentStatus = results[0].status;
        console.log(`[failPayment] Estado actual de la reserva: ${currentStatus}`);

        if (currentStatus !== 'PENDING') {
            console.warn(`[failPayment] ⚠️ No se puede marcar como FAILED. Estado actual: ${currentStatus}`);
            return res.status(400).json({ error: `Cannot fail payment. Current status: ${currentStatus}. Only PENDING reservations can be failed.` }); // 400
        }

        console.log('[failPayment] Creando evento de pago fallido...');
        paymentEventsModel.createPaymentEventAndFailReservation(paymentData, async (err, result) => {
            if (err) {
                console.error('[failPayment] ❌ Error al crear el evento de pago:', err);
                return res.status(500).json({ error: 'Error processing payment event', details: err }); // 500
            }

            console.log('[failPayment] Evento de pago creado exitosamente:', result);

            // Publicar evento de actualización de reserva
            try {
                console.log('[failPayment] Publicando evento de reserva actualizada...');
                await eventsProducer.sendReservationUpdatedEvent({
                    reservationId: String(paymentData.reservationId),
                    newStatus: 'FAILED',
                    reservationDate: result.reservationDate,
                    flightDate: result.flightDate
                });
                console.log('✅ [failPayment] Evento de reserva actualizada publicado para estado FAILED');
            } catch (eventError) {
                console.error('[failPayment] ❌ Error al publicar el evento de reserva actualizada:', eventError);
                // No fallar la respuesta aunque falle el evento
            }

            res.status(201).json({ message: 'Payment event created and reservation marked as FAILED', ...result }); // 201
        });
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
