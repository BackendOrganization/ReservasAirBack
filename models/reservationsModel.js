const getReservationsByExternalUserId = (externalUserId, callback) => {
    const query = `
        SELECT r.*, s.seatNumber
        FROM reservations r
        LEFT JOIN seats s ON r.seatId = s.seatId
        WHERE r.externalUserId = ? AND (r.status = 'PAID' OR r.status = 'CANCELLED')
    `;
    db.query(query, [externalUserId], (err, results) => {
        if (err) return callback(err);
        callback(null, results);
    });
};
const db = require('../config/db');
const asientosModel = require('./seatsModel');



const createReservation = (externalUserId, externalFlightId, seatIds, amount, callback) => {
    if (!externalFlightId) {
        return callback({ success: false, message: 'externalFlightId is required.' });
    }
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
        return callback({ success: false, message: 'seatIds must be a non-empty array.' });
    }

    const placeholders = seatIds.map(() => '?').join(',');
    const checkQuery = `
        SELECT seatId, status FROM seats 
        WHERE seatId IN (${placeholders}) AND (status = 'RESERVED' OR status = 'CONFIRMED')
    `;
    db.query(checkQuery, seatIds, (err, rows) => {
        if (err) return callback(err);
        if (rows.length > 0) {
            return callback(null, { 
                success: false, 
                message: 'One or more seats are already taken.', 
                takenSeats: rows.map(r => r.seatId) 
            });
        }

        // Guardar array como JSON en seatId (aunque el nombre sea seatId)
        const status = 'PENDING';
        const seatIdJson = JSON.stringify(seatIds);
        const insertQuery = `INSERT INTO reservations (externalUserId, externalFlightId, seatId, status) VALUES (?, ?, ?, ?)`;
        db.query(insertQuery, [externalUserId, externalFlightId, seatIdJson, status], (err2, result) => {
            if (err2) return callback(err2);

            // Actualizar el estado de cada asiento
            let completed = 0;
            let hasError = false;
            seatIds.forEach((seatId) => {
                asientosModel.reserveSeat(externalFlightId, seatId, (err3) => {
                    if (hasError) return;
                    if (err3) {
                        hasError = true;
                        return callback(err3);
                    }
                    completed++;
                    if (completed === seatIds.length) {
                        const reservationId = result.insertId;
                        const eventoQuery = `INSERT INTO paymentEvents (reservationId, externalUserId, paymentStatus, amount) VALUES (?, ?, 'PENDING', ?)`;
                        db.query(eventoQuery, [reservationId, externalUserId, amount], (err4) => {
                            if (err4) return callback(err4);
                            callback(null, { success: true, message: 'All seats reserved in one reservation.', reservationId });
                        });
                    }
                });
            });
        });
    });
};

const cancelReservation = (reservationId, amount, callback) => {
    const findReservationQuery = `SELECT * FROM reservations WHERE reservationId = ?`;
    db.query(findReservationQuery, [reservationId], (err, reservationRows) => {
        if (err) return callback(err);
        if (!reservationRows[0]) {
            return callback(null, { success: false, message: 'Reservation does not exist.' });
        }
        const reservation = reservationRows[0];
        if (reservation.status !== 'PAID') {
            return callback(null, { success: false, message: 'Only PAID reservations can be cancelled.' });
        }
        if (amount == null || isNaN(amount)) {
            return callback(null, { success: false, message: 'Amount is required and must be a number.' });
        }

        // Solo actualizar la reserva, sin tocar paymentEvents
        const cancelQuery = `UPDATE reservations SET status = 'PENDING', totalPrice = ? WHERE reservationId = ?`;
        db.query(cancelQuery, [amount, reservationId], (err2) => {
            if (err2) return callback(err2);
            callback(null, { success: true, message: 'Reservation status changed to PENDING.' });
        });
    });
};

const changeSeat = (reservationId, oldSeatId, newSeatId, callback) => {
    const updateReservaQuery = `UPDATE reservations SET seatId = ? WHERE reservationId = ?`;
    db.query(updateReservaQuery, [newSeatId, reservationId], (err, result) => {
        if (err) return callback(err);
        const liberarAsientoQuery = `UPDATE seats SET status = 'AVAILABLE' WHERE seatId = ?`;
        db.query(liberarAsientoQuery, [oldSeatId], (err2, result2) => {
            if (err2) return callback(err2);
            const reservarAsientoQuery = `UPDATE seats SET status = 'RESERVED' WHERE seatId = ?`;
            db.query(reservarAsientoQuery, [newSeatId], (err3, result3) => {
                if (err3) return callback(err3);
                const details = `Cambio de asiento de ${oldSeatId} a ${newSeatId}`;
                callback(null, { details });
            });
        });
    });
};

module.exports = {
    createReservation,
    cancelReservation,
    changeSeat
    ,getReservationsByExternalUserId
};
