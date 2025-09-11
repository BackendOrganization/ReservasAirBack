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



const createReservation = (externalUserId, externalFlightId, seatId, amount, callback) => {
    if (!externalFlightId) {
        return callback({ success: false, message: 'externalFlightId is required.' });
    }
    const checkQuery = `SELECT * FROM reservations WHERE seatId = ? AND (status = 'PENDING' OR status = 'CONFIRMED')`;
    db.query(checkQuery, [seatId], (err, rows) => {
        if (err) return callback(err);
        if (rows.length > 0) {
            return callback(null, { success: false, message: 'Seat is already taken.' });
        }
        const seatStatusQuery = `SELECT status FROM seats WHERE seatId = ?`;
        db.query(seatStatusQuery, [seatId], (err2, seatRows) => {
            if (err2) return callback(err2);
            if (!seatRows[0]) {
                return callback(null, { success: false, message: 'Seat does not exist.' });
            }
            if (seatRows[0].status === 'CONFIRMED') {
                return callback(null, { success: false, message: 'Seat is already confirmed and cannot be reserved.' });
            }
            const status = 'PENDING';
            const query = `INSERT INTO reservations (externalUserId, externalFlightId, seatId, status) VALUES (?, ?, ?, ?)`;
            db.query(query, [externalUserId, externalFlightId, seatId, status], (err3, result) => {
                if (err3) return callback(err3);
                asientosModel.reserveSeat(externalFlightId, seatId, (err4, res2) => {
                    if (err4) return callback(err4);
                    const reservationId = result.insertId;
                    const eventoQuery = `INSERT INTO paymentEvents (reservationId, userId, paymentStatus, amount) VALUES (?, ?, 'PENDING', ?)`;
                    db.query(eventoQuery, [reservationId, externalUserId, amount], (err5, resultEvento) => {
                        if (err5) return callback(err5);
                        callback(null, { success: true, message: 'Seat reserved successfully.' });
                    });
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
        if (reservation.status === 'CANCELLED') {
            return callback(null, { success: false, message: 'Reservation is already cancelled.' });
        }
                                const pendingQuery = `UPDATE reservations SET status = 'PENDING' WHERE reservationId = ?`;
        const seatId = reservation.seatId;
        const externalFlightId = reservation.externalFlightId;
        asientosModel.cancelSeat(externalFlightId, seatId, (err3, res3) => {
            if (err3) return callback(err3);
            if (!res3.success) {
                // Do not cancel reservation or log payment event if seat cancellation failed
                return callback(null, { success: false, message: res3.message });
            }
                            db.query(pendingQuery, [reservationId], (err2, result2) => {
                if (err2) return callback(err2);
                                    const eventoQuery = `INSERT INTO paymentEvents (reservationId, userId, paymentStatus, amount) VALUES (?, ?, 'PENDING', ?)`;
                db.query(eventoQuery, [reservationId, reservation.externalUserId, amount], (err4, resultEvento) => {
                    if (err4) return callback(err4);
                    callback(null, { success: true, message: res3.message });
                });
            });
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
