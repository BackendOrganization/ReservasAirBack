const db = require('../config/db');

const insertFlight = (flightData, callback) => {
    // Verifica si el externalFlightId ya existe
    const checkSql = 'SELECT COUNT(*) AS count FROM flights WHERE externalFlightId = ?';
    db.query(checkSql, [flightData.id], (err, results) => {
        if (err) return callback(err);
        if (results[0].count > 0) {
            return callback({ message: 'externalFlightId already exists' });
        }

        const sql = `
            INSERT INTO flights (
                externalFlightId,
                aircraft,
                aircraftModel,
                origin,
                destination,
                flightDate,
                duration,
                freeSeats,
                occupiedSeats
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        db.query(
            sql,
            [
                flightData.id,
                flightData.aircraft,
                flightData.aircraftModel,
                JSON.stringify(flightData.origin),
                JSON.stringify(flightData.destination),
                flightData.flightDate,
                flightData.duration,
                flightData.freeSeats || 0,
                0 // occupiedSeats lo manejamos nosotros, siempre inicia en 0
            ],
            callback
        );
    });
};

// Nuevo método: cancela todas las reservas de un vuelo y crea eventos de pago cancelados
const cancelReservationsByFlight = (externalFlightId, callback) => {
    const selectSql = `
        SELECT r.reservationId, r.externalUserId, r.seatId, r.totalPrice
        FROM reservations r
        WHERE r.externalFlightId = ? AND r.status != 'CANCELLED'
    `;
    db.query(selectSql, [externalFlightId], (err, reservations) => {
        if (err) return callback(err);
        if (reservations.length === 0) return callback(null, { updated: 0, events: [] });
        const reservationIds = reservations.map(r => r.reservationId);
        const updateSql = `UPDATE reservations SET status = 'CANCELLED' WHERE reservationId IN (?)`;
        db.query(updateSql, [reservationIds], (err2) => {
            if (err2) return callback(err2);
            const events = [];
            let pending = reservations.length;
            reservations.forEach(r => {
                const eventSql = `INSERT INTO paymentEvents (reservationId, externalUserId, paymentStatus, amount) VALUES (?, ?, 'REFUND', ?)`;
                db.query(eventSql, [r.reservationId, r.externalUserId, r.totalPrice], (err3, result) => {
                    if (err3) return callback(err3);
                    events.push({ reservationId: r.reservationId, eventId: result.insertId });
                    pending--;
                    if (pending === 0) callback(null, { updated: reservations.length, events });
                });
            });
        });
    });
};

// Obtener todos los vuelos
const getAllFlights = (callback) => {
    const sql = 'SELECT * FROM flights';
    db.query(sql, callback);
};

module.exports = { insertFlight, cancelReservationsByFlight, getAllFlights };