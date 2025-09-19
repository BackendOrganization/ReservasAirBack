const db = require('../config/db');
const seatsModel = require('./seatsModel');


const confirmPayment = (paymentStatus, reservationId, externalUserId, callback) => {
    // Verificar si ya existe un evento SUCCESS para esa reserva
    const checkSuccessQuery = `
        SELECT eventId FROM paymentEvents WHERE reservationId = ? AND paymentStatus = 'SUCCESS' LIMIT 1
    `;
    db.query(checkSuccessQuery, [reservationId], (errCheck, successRows) => {
        if (errCheck) return callback(errCheck);
        if (successRows.length > 0) {
            return callback(null, { success: false, message: 'Payment already confirmed for this reservation.' });
        }

        // 1. Obtener el evento PENDING
        const getPendingEventQuery = `SELECT amount FROM paymentEvents WHERE reservationId = ? AND externalUserId = ? AND paymentStatus = 'PENDING' LIMIT 1`;
        db.query(getPendingEventQuery, [reservationId, externalUserId], (err, rows) => {
            if (err) return callback(err);
            if (!rows[0]) return callback(null, { success: false, message: 'No pending payment event found.' });
            const amount = rows[0].amount;

            // 2. Insertar evento SUCCESS
            const insertSuccessQuery = `INSERT INTO paymentEvents (reservationId, externalUserId, paymentStatus, amount) VALUES (?, ?, 'SUCCESS', ?)`;
            db.query(insertSuccessQuery, [reservationId, externalUserId, amount], (err2) => {
                if (err2) return callback(err2);

                // 3. Actualizar la reserva y los asientos como antes...
                const updateReservationQuery = `UPDATE reservations SET status = 'PAID' WHERE reservationId = ?`;
                db.query(updateReservationQuery, [reservationId], (err3) => {
                    if (err3) return callback(err3);

                    const getReservationQuery = `SELECT seatId, externalFlightId FROM reservations WHERE reservationId = ?`;
                    db.query(getReservationQuery, [reservationId], (err4, rows2) => {
                        if (err4) return callback(err4);
                        if (!rows2[0]) return callback(null, { success: false, message: 'Reservation not found.' });
                        const { seatId, externalFlightId } = rows2[0];
                        let seatIds = [];
                        try {
                            seatIds = JSON.parse(seatId);
                            if (!Array.isArray(seatIds)) seatIds = [seatIds];
                        } catch (e) {
                            seatIds = [seatId];
                        }
                        const placeholders = seatIds.map(() => '?').join(',');
                        const confirmSeatsQuery = `UPDATE seats SET status = 'CONFIRMED' WHERE seatId IN (${placeholders}) AND externalFlightId = ?`;
                        db.query(confirmSeatsQuery, [...seatIds, externalFlightId], (err5) => {
                            if (err5) return callback(err5);
                            callback(null, { success: true, message: 'Payment confirmed, reservation PAID, seats CONFIRMED, payment event created.' });
                        });
                    });
                });
            });
        });
    });
};

const cancelPayment = (reservationId, externalUserId, callback) => {
    db.beginTransaction(errTrans => {
        if (errTrans) return callback(errTrans);

        // Bloquear la reserva para evitar concurrencia
        const findReservationQuery = `SELECT * FROM reservations WHERE reservationId = ? FOR UPDATE`;
        db.query(findReservationQuery, [reservationId], (err, reservationRows) => {
            if (err) return db.rollback(() => { callback(err); });

            if (!reservationRows[0]) {
                return db.rollback(() => { callback(null, { success: false, message: 'Reservation does not exist.' }); });
            }

            const reservation = reservationRows[0];
            if (reservation.status !== 'PENDING') {
                return db.rollback(() => { callback(null, { success: false, message: 'Only PENDING reservations can be refunded.' }); });
            }

            // Verificar si ya existe un REFUND
            const checkRefundQuery = `SELECT eventId FROM paymentEvents WHERE reservationId = ? AND paymentStatus = 'REFUND' LIMIT 1`;
            db.query(checkRefundQuery, [reservationId], (errCheck, refundRows) => {
                if (errCheck) return db.rollback(() => { callback(errCheck); });
                if (refundRows.length > 0) {
                    return db.rollback(() => { callback(null, { success: false, message: 'Refund event already exists for this reservation.' }); });
                }

                // Actualizar reserva a CANCELLED
                const cancelQuery = `UPDATE reservations SET status = 'CANCELLED' WHERE reservationId = ?`;
                db.query(cancelQuery, [reservationId], (err2) => {
                    if (err2) return db.rollback(() => { callback(err2); });

                    // Obtener datos para liberar asientos y crear evento REFUND
                    const getReservationQuery = `SELECT seatId, externalFlightId, totalPrice FROM reservations WHERE reservationId = ?`;
                    db.query(getReservationQuery, [reservationId], (err3, rows) => {
                        if (err3) return db.rollback(() => { callback(err3); });
                        if (!rows[0]) return db.rollback(() => { callback(null, { success: false, message: 'Reservation not found.' }); });
                        const { seatId, externalFlightId, totalPrice } = rows[0];

                        let seatIds = [];
                        try {
                            seatIds = JSON.parse(seatId);
                            if (!Array.isArray(seatIds)) seatIds = [seatIds];
                        } catch (e) {
                            seatIds = [seatId];
                        }

                        // Crear evento REFUND en paymentEvents
                        const refundEventQuery = `INSERT INTO paymentEvents (reservationId, externalUserId, paymentStatus, amount) VALUES (?, ?, 'REFUND', ?)`;
                        db.query(refundEventQuery, [reservationId, externalUserId, totalPrice], (err5) => {
                            if (err5) return db.rollback(() => { callback(err5); });

                            // Liberar todos los asientos
                            const placeholders = seatIds.map(() => '?').join(',');
                            const releaseSeatsQuery = `
                                UPDATE seats SET status = 'AVAILABLE'
                                WHERE externalFlightId = ? AND seatId IN (${placeholders}) AND status = 'CONFIRMED'
                            `;
                            db.query(releaseSeatsQuery, [externalFlightId, ...seatIds], (err6) => {
                                if (err6) return db.rollback(() => { callback(err6); });

                                // Commit
                                db.commit(errCommit => {
                                    if (errCommit) return db.rollback(() => { callback(errCommit); });
                                    callback(null, { success: true, message: 'Reservation cancelled, seats released, refund event created.' });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
};

const createPaymentEventAndFailReservation = (paymentData, callback) => {
    // Verifica si ya existe un evento FAILED para esa reserva
    const checkSql = `
        SELECT COUNT(*) AS count
        FROM paymentEvents
        WHERE reservationId = ? AND paymentStatus = 'FAILED'
    `;
    db.query(checkSql, [paymentData.reservationId], (err, results) => {
        if (err) return callback(err);
        if (results[0].count > 0) {
            return callback({ message: 'A FAILED payment event already exists for this reservationId.' });
        }

        // Obtener el totalPrice de la reserva para el campo amount
        const getAmountSql = `SELECT totalPrice FROM reservations WHERE reservationId = ?`;
        db.query(getAmountSql, [paymentData.reservationId], (err2, rows) => {
            if (err2) return callback(err2);
            const amount = rows[0] ? rows[0].totalPrice : 0;

            // Crear el evento de pago con amount
            const insertEventSql = `
                INSERT INTO paymentEvents (paymentStatus, reservationId, externalUserId, amount)
                VALUES (?, ?, ?, ?)
            `;
            db.query(
                insertEventSql,
                [paymentData.paymentStatus, paymentData.reservationId, paymentData.externalUserId, amount],
                (err, eventResult) => {
                    if (err) return callback(err);

                    // Marcar la reserva como FAILED solo si no está ya en ese estado
                    const updateReservationSql = `
                        UPDATE reservations SET status = 'FAILED'
                        WHERE reservationId = ? AND status != 'FAILED'
                    `;
                    db.query(updateReservationSql, [paymentData.reservationId], (err, resResult) => {
                        if (err) return callback(err);
                        callback(null, { paymentEventId: eventResult.insertId, reservationId: paymentData.reservationId });
                    });
                }
            );
        });
    });
};

module.exports = {
    confirmPayment,
    cancelPayment,
    createPaymentEventAndFailReservation
};
