const db = require('../config/db');

const confirmPayment = (paymentStatus, reservationId, userId, callback) => {
    // 1. Update paymentEvents to SUCCESS for this reservation
    const updatePaymentQuery = `UPDATE paymentEvents SET paymentStatus = ? WHERE reservationId = ? AND userId = ? AND paymentStatus = 'PENDING'`;
    db.query(updatePaymentQuery, [paymentStatus, reservationId, userId], (err, result) => {
        if (err) return callback(err);
        if (result.affectedRows === 0) {
            return callback(null, { success: false, message: 'No pending payment event found for this reservation and user.' });
        }
        // 2. Update reservation to PAID
        const updateReservationQuery = `UPDATE reservations SET status = 'PAID' WHERE reservationId = ?`;
        db.query(updateReservationQuery, [reservationId], (err2, result2) => {
            if (err2) return callback(err2);
            // 3. Get seatId and externalFlightId from reservation
            const getReservationQuery = `SELECT seatId, externalFlightId FROM reservations WHERE reservationId = ?`;
            db.query(getReservationQuery, [reservationId], (err3, rows) => {
                if (err3) return callback(err3);
                if (!rows[0]) return callback(null, { success: false, message: 'Reservation not found.' });
                const { seatId, externalFlightId } = rows[0];
                // 4. Update seat to CONFIRMED
                const updateSeatQuery = `UPDATE seats SET status = 'CONFIRMED' WHERE seatId = ? AND externalFlightId = ?`;
                db.query(updateSeatQuery, [seatId, externalFlightId], (err4, result4) => {
                    if (err4) return callback(err4);
                    callback(null, { success: true, message: 'Payment confirmed, reservation paid, seat confirmed.' });
                });
            });
        });
    });
};

const seatsModel = require('./seatsModel');
const cancelPayment = (reservationId, userId, callback) => {
    // Only update reservation to CANCELLED and seat to AVAILABLE using seatsModel logic
    const updateReservationQuery = `UPDATE reservations SET status = 'CANCELLED' WHERE reservationId = ?`;
    db.query(updateReservationQuery, [reservationId], (err2, result2) => {
        if (err2) return callback(err2);
        // Get seatId and externalFlightId from reservation
        const getReservationQuery = `SELECT seatId, externalFlightId FROM reservations WHERE reservationId = ?`;
        db.query(getReservationQuery, [reservationId], (err3, rows) => {
            if (err3) return callback(err3);
            if (!rows[0]) return callback(null, { success: false, message: 'Reservation not found.' });
            const { seatId, externalFlightId } = rows[0];
            seatsModel.cancelSeat(externalFlightId, seatId, (err4, res4) => {
                if (err4) return callback(err4);
                callback(null, { success: res4.success, message: res4.message });
            });
        });
    });
};

module.exports = {
    confirmPayment,
    cancelPayment
};
