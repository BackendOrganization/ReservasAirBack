const db = require('../config/db');


const getAllSeats = (flightId, callback) => {
    const query = 'SELECT * FROM seats WHERE externalFlightId = ?';
    db.query(query, [flightId], (err, results) => {
        if (err) return callback(err);
        callback(null, results);
    });
};


const reserveSeat = (flightId, seatId, callback) => {
    const query = `UPDATE seats SET status = 'RESERVED' WHERE externalFlightId = ? AND seatId = ? AND status = 'AVAILABLE'`;
    db.query(query, [flightId, seatId], (err, result) => {
        if (err) return callback(err);
        if (result.affectedRows === 0) {
            return callback(null, { success: false, message: 'Seat is not available or does not exist.' });
        }
        callback(null, { success: true, message: 'Seat reserved successfully.' });
    });
};

const cancelSeat = (flightId, seatId, callback) => {
    const query = `UPDATE seats SET status = 'AVAILABLE' WHERE externalFlightId = ? AND seatId = ? AND status = 'CONFIRMED'`;
    db.query(query, [flightId, seatId], (err, result) => {
        if (err) return callback(err);
        if (result.affectedRows === 0) {
            return callback(null, { success: false, message: 'Seat was not confirmed or does not exist.' });
        }
        callback(null, { success: true, message: 'Seat cancelled successfully.' });
    });
};

const timeoutOrPaymentFailure = (flightId, seatId, callback) => {
    const query = `UPDATE seats SET status = 'AVAILABLE' WHERE externalFlightId = ? AND seatId = ? AND status = 'PENDING'`;
    db.query(query, [flightId, seatId], (err, result) => {
        if (err) return callback(err);
        if (result.affectedRows === 0) {
            return callback(null, { success: false, message: 'Timeout or payment failure.' });
        }
        callback(null, { success: true, message: 'Reservation failed, please try again.' });
    });
};


module.exports = {
    getAllSeats,
    reserveSeat,
    cancelSeat,
    timeoutOrPaymentFailure
};


