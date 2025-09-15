const db = require('../config/db');





const getAllSeats = (externalFlightId, callback) => {
    const query = 'SELECT seatId, externalFlightId, seatNumber, category, status, price FROM seats WHERE externalFlightId = ?';
    db.query(query, [externalFlightId], (err, results) => {
        if (err) return callback(err);
        callback(null, results);
    });
};


// Obtiene los asientos reservados o confirmados junto con externalFlightId y aircraft
const getReservedOrConfirmedSeats = (externalFlightId, callback) => {
    const query = `
        SELECT s.*, f.externalFlightId, f.aircraft
        FROM seats s
        JOIN flights f ON s.externalFlightId = f.externalFlightId
        WHERE s.status IN ('RESERVED', 'CONFIRMED')
        AND s.externalFlightId = ?
    `;
    db.query(query, [externalFlightId], (err, results) => {
        if (err) return callback(err);
        callback(null, results);
    });
};
const reserveSeat = (externalFlightId, seatId, callback) => {
    const query = `UPDATE seats SET status = 'RESERVED' WHERE externalFlightId = ? AND seatId = ? AND status = 'AVAILABLE'`;
    db.query(query, [externalFlightId, seatId], (err, result) => {
        if (err) return callback(err);
        if (result.affectedRows === 0) {
            return callback(null, { success: false, message: 'Seat is not available or does not exist.' });
        }
        callback(null, { success: true, message: 'Seat reserved successfully.' });
    });
};

const cancelSeat = (externalFlightId, seatId, callback) => {
    const query = `UPDATE seats SET status = 'AVAILABLE' WHERE externalFlightId = ? AND seatId = ? AND status = 'CONFIRMED'`;
    db.query(query, [externalFlightId, seatId], (err, result) => {
        if (err) return callback(err);
        if (result.affectedRows === 0) {
            return callback(null, { success: false, message: 'Seat was not confirmed or does not exist.' });
        }
        callback(null, { success: true, message: 'Seat cancelled successfully.' });
    });
};

const timeoutOrPaymentFailure = (externalFlightId, seatId, callback) => {
    const query = `UPDATE seats SET status = 'AVAILABLE' WHERE externalFlightId = ? AND seatId = ? AND status = 'PENDING'`;
    db.query(query, [externalFlightId, seatId], (err, result) => {
        if (err) return callback(err);
        if (result.affectedRows === 0) {
            return callback(null, { success: false, message: 'Timeout or payment failure.' });
        }
        callback(null, { success: true, message: 'Reservation failed, please try again.' });
    });
};



module.exports = {
    getAllSeats,
    getReservedOrConfirmedSeats,
    reserveSeat,
    cancelSeat,
    timeoutOrPaymentFailure
};


