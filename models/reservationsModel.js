const db = require('../config/db');
const asientosModel = require('./seatsModel');



const createReservation = (userId, flightId, seatId, amount, callback) => {
    const status = 'PENDING';
    const query = `INSERT INTO reservations (externalUserId, externalFlightId, seatId, status) VALUES (?, ?, ?, ?)`;
    db.query(query, [userId, flightId, seatId, status], (err, result) => {
        if (err) return callback(err);
        asientosModel.reservarAsiento(flightId, seatId, (err2, res2) => {
            if (err2) return callback(err2);
            const reservationId = result.insertId;
            const eventoQuery = `INSERT INTO paymentEvents (reservationId, userId, paymentStatus, amount) VALUES (?, ?, 'PENDING', ?)`;
            db.query(eventoQuery, [reservationId, userId, amount], (err3, resultEvento) => {
                if (err3) return callback(err3);
                callback(null, { success: true, reservationId, seat: res2 });
            });
        });
    });
};

const cancelReservation = (userId, flightId, seatId, amount, callback) => {
    const checkStatusQuery = `SELECT status FROM seats WHERE externalFlightId = ? AND seatId = ?`;
    db.query(checkStatusQuery, [flightId, seatId], (errCheck, statusRows) => {
        if (errCheck) return callback(errCheck);
        if (!statusRows[0] || statusRows[0].status === 'CANCELLED' || statusRows[0].status !== 'RESERVED') {
            return callback(null, {
                success: false,
                message: 'El asiento no estaba confirmado, no existe o ya está cancelado.'
            });
        }

        const status = 'CANCELLED';
        const query = `INSERT INTO reservations (externalUserId, externalFlightId, seatId, status) VALUES (?, ?, ?, ?)`;
        db.query(query, [userId, flightId, seatId, status], (err, result) => {
            if (err) return callback(err);
            asientosModel.cancelarAsiento(flightId, seatId, (err2, res2) => {
                if (err2) return callback(err2);
                const reservationId = result.insertId;
                const eventoQuery = `INSERT INTO paymentEvents (reservationId, userId, paymentStatus, amount) VALUES (?, ?, 'CANCELLED', ?)`;
                db.query(eventoQuery, [reservationId, userId, amount], (err3, resultEvento) => {
                    if (err3) return callback(err3);
                    callback(null, { success: true, reservationId, seat: res2 });
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
};
