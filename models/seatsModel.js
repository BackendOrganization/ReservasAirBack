const db = require('../config/db');


// Obtiene los asientos reservados o confirmados junto con externalFlightId y aircraft
const getReservedOrConfirmedSeats = (externalFlightId, callback) => {
    const query = `
        SELECT s.seatId, s.status, f.externalFlightId, f.aircraft
        FROM seats s
        JOIN flights f ON s.externalFlightId = f.externalFlightId
        WHERE s.status IN ('RESERVED', 'CONFIRMED')
        AND s.externalFlightId = ?
    `;
    db.query(query, [externalFlightId], (err, results) => {
        if (err) return callback(err);

        const occupiedSeats = [];
        const reservedSeats = [];
        let airCraftType = null;
        let flightId = null;

        results.forEach(row => {
            if (row.status === 'CONFIRMED') occupiedSeats.push(row.seatId);
            if (row.status === 'RESERVED') reservedSeats.push(row.seatId);
            airCraftType = row.aircraft;
            flightId = row.externalFlightId;
        });

        // Si no hay asientos reservados/confirmados, obtener datos del vuelo
        if (results.length === 0) {
            const flightQuery = `SELECT externalFlightId, aircraft FROM flights WHERE externalFlightId = ? LIMIT 1`;
            db.query(flightQuery, [externalFlightId], (err2, flightRows) => {
                if (err2) return callback(err2);
                if (!flightRows[0]) {
                    return callback(null, {
                        flightId: null,
                        airCraftType: null,
                        occupiedSeats: [],
                        reservedSeats: []
                    });
                }
                callback(null, {
                    flightId: flightRows[0].externalFlightId,
                    airCraftType: flightRows[0].aircraft,
                    occupiedSeats: [],
                    reservedSeats: []
                });
            });
        } else {
            callback(null, {
                flightId,
                airCraftType,
                occupiedSeats,
                reservedSeats
            });
        }
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
    getReservedOrConfirmedSeats,
    reserveSeat,
    cancelSeat,
    timeoutOrPaymentFailure
};


