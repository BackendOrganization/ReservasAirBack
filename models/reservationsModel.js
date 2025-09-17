const db = require('../config/db');
const asientosModel = require('./seatsModel');


const getReservationsByExternalUserId = (externalUserId, callback) => {
    const sql = `
        SELECT 
            r.reservationId,
            r.externalUserId,
            r.externalFlightId,
            r.seatId,
            r.status,
            r.createdAt,
            r.updatedAt,
            r.totalPrice,
            f.flightDate,
            f.aircraftModel,
            f.origin,
            f.destination,
            f.aircraft
        FROM reservations r
        LEFT JOIN flights f ON r.externalFlightId = f.externalFlightId
        WHERE r.externalUserId = ?
        AND (r.status = 'PAID' OR r.status = 'CANCELLED')
    `;
    db.query(sql, [externalUserId], async (err, reservations) => {
        if (err) return callback(err);

        try {
            const results = await Promise.all(reservations.map(async (reservation) => {
                let seatIds = [];
                if (reservation.seatId) {
                    if (Array.isArray(reservation.seatId)) {
                        seatIds = reservation.seatId.map(id => Number(id)).filter(id => !isNaN(id));
                    } else if (typeof reservation.seatId === 'string') {
                        try {
                            const parsed = JSON.parse(reservation.seatId);
                            if (Array.isArray(parsed)) {
                                seatIds = parsed.map(id => Number(id)).filter(id => !isNaN(id));
                            } else if (!isNaN(parsed)) {
                                seatIds = [Number(parsed)];
                            }
                        } catch {
                            const matches = reservation.seatId.match(/\d+/g);
                            if (matches) {
                                seatIds = matches.map(id => Number(id)).filter(id => !isNaN(id));
                            } else if (!isNaN(reservation.seatId)) {
                                seatIds = [Number(reservation.seatId)];
                            }
                        }
                    } else if (!isNaN(reservation.seatId)) {
                        seatIds = [Number(reservation.seatId)];
                    }
                }

                let seats = [];
                if (seatIds.length > 0) {
                    const seatSql = `
                        SELECT seatId, seatNumber, category AS cabinName, price
                        FROM seats
                        WHERE seatId IN (${seatIds.map(() => '?').join(',')})
                    `;
                    const seatResult = await db.promise().query(seatSql, seatIds);
                    seats = seatResult[0];
                }

                let origin = {};
                let destination = {};
                // Corrige el parseo para devolver el objeto si es string JSON, o el valor original si ya es objeto
                try {
                    origin = typeof reservation.origin === 'string' && reservation.origin.trim().startsWith('{')
                        ? JSON.parse(reservation.origin)
                        : reservation.origin || {};
                } catch {
                    origin = {};
                }
                try {
                    destination = typeof reservation.destination === 'string' && reservation.destination.trim().startsWith('{')
                        ? JSON.parse(reservation.destination)
                        : reservation.destination || {};
                } catch {
                    destination = {};
                }

                return {
                    reservationId: reservation.reservationId,
                    externalUserId: reservation.externalUserId,
                    externalFlightId: reservation.externalFlightId,
                    flightData: {
                        flightNumber: reservation.aircraft,
                        origin,
                        destination,
                        flightDate: reservation.flightDate,
                        aircraftModel: reservation.aircraftModel,
                    },
                    seats,
                    totalPrice: Number(reservation.totalPrice),
                    status: reservation.status,
                    createdAt: reservation.createdAt,
                    updatedAt: reservation.updatedAt,
                };
            }));

            callback(null, results);
        } catch (error) {
            callback(error);
        }
    });
};



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

        let completed = 0;
        let hasError = false;
        let reservationId = null;
        const status = 'PENDING';
        const seatIdJson = JSON.stringify(seatIds);
        // Agrega totalPrice al insert
        const insertQuery = `INSERT INTO reservations (externalUserId, externalFlightId, seatId, status, totalPrice) VALUES (?, ?, ?, ?, ?)`;
        db.query(insertQuery, [externalUserId, externalFlightId, seatIdJson, status, amount], (err2, result) => {
            if (err2) return callback(err2);

            reservationId = result.insertId;

            seatIds.forEach((seatId) => {
                asientosModel.reserveSeat(externalFlightId, seatId, (err3, reserveResult) => {
                    if (hasError) return;
                    if (err3 || !reserveResult || reserveResult.success === false) {
                        hasError = true;
                        // Elimina la reserva creada si algún asiento falla
                        const deleteQuery = `DELETE FROM reservations WHERE reservationId = ?`;
                        db.query(deleteQuery, [reservationId], () => {
                            return callback(null, { 
                                success: false, 
                                message: `Seat ${seatId} is not available or does not exist. Reservation cancelled.` 
                            });
                        });
                        return;
                    }
                    completed++;
                    if (completed === seatIds.length && !hasError) {
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

        // Actualizar la reserva y crear el evento PENDING
        const cancelQuery = `UPDATE reservations SET status = 'PENDING', totalPrice = ? WHERE reservationId = ?`;
        db.query(cancelQuery, [amount, reservationId], (err2) => {
            if (err2) return callback(err2);

            // Crear evento PENDING en paymentEvents
            const pendingEventQuery = `
                INSERT INTO paymentEvents (reservationId, externalUserId, paymentStatus, amount)
                VALUES (?, ?, 'PENDING', ?)
            `;
            db.query(pendingEventQuery, [reservationId, reservation.externalUserId, amount], (err3) => {
                if (err3) return callback(err3);
                callback(null, { success: true, message: 'Reservation status changed to PENDING and payment event created.' });
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

const getFullReservationsByExternalUserId = (externalUserId, callback) => {
    const sql = `
        SELECT 
            r.reservationId,
            r.externalUserId,
            r.externalFlightId,
            r.seatId,
            r.status,
            r.createdAt,
            r.updatedAt,
            r.totalPrice,
            f.flightDate,
            f.aircraftModel,
            f.origin,
            f.destination,
            f.aircraft
        FROM reservations r
        LEFT JOIN flights f ON r.externalFlightId = f.externalFlightId
        WHERE r.externalUserId = ?
        AND (r.status = 'PAID' OR r.status = 'CANCELLED')
    `;
    db.query(sql, [externalUserId], async (err, reservations) => {
        if (err) return callback(err);

        try {
            const results = await Promise.all(reservations.map(async (reservation) => {
                let seatIds = [];
                if (reservation.seatId) {
                    if (Array.isArray(reservation.seatId)) {
                        seatIds = reservation.seatId.map(id => Number(id)).filter(id => !isNaN(id));
                    } else if (typeof reservation.seatId === 'string') {
                        try {
                            const parsed = JSON.parse(reservation.seatId);
                            if (Array.isArray(parsed)) {
                                seatIds = parsed.map(id => Number(id)).filter(id => !isNaN(id));
                            } else if (!isNaN(parsed)) {
                                seatIds = [Number(parsed)];
                            }
                        } catch {
                            const matches = reservation.seatId.match(/\d+/g);
                            if (matches) {
                                seatIds = matches.map(id => Number(id)).filter(id => !isNaN(id));
                            } else if (!isNaN(reservation.seatId)) {
                                seatIds = [Number(reservation.seatId)];
                            }
                        }
                    } else if (!isNaN(reservation.seatId)) {
                        seatIds = [Number(reservation.seatId)];
                    }
                }

                let seats = [];
                if (seatIds.length > 0) {
                    const seatSql = `
                        SELECT seatId, seatNumber, category AS cabinName, price
                        FROM seats
                        WHERE seatId IN (${seatIds.map(() => '?').join(',')})
                    `;
                    const seatResult = await db.promise().query(seatSql, seatIds);
                    seats = seatResult[0];
                }

                let origin = {};
                let destination = {};
                // Corrige el parseo para devolver el objeto si es string JSON, o el valor original si ya es objeto
                try {
                    origin = typeof reservation.origin === 'string' && reservation.origin.trim().startsWith('{')
                        ? JSON.parse(reservation.origin)
                        : reservation.origin || {};
                } catch {
                    origin = {};
                }
                try {
                    destination = typeof reservation.destination === 'string' && reservation.destination.trim().startsWith('{')
                        ? JSON.parse(reservation.destination)
                        : reservation.destination || {};
                } catch {
                    destination = {};
                }

                return {
                    reservationId: reservation.reservationId,
                    externalUserId: reservation.externalUserId,
                    externalFlightId: reservation.externalFlightId,
                    flightData: {
                        flightNumber: reservation.aircraft,
                        origin,
                        destination,
                        flightDate: reservation.flightDate,
                        aircraftModel: reservation.aircraftModel,
                    },
                    seats,
                    totalPrice: Number(reservation.totalPrice),
                    status: reservation.status,
                    createdAt: reservation.createdAt,
                    updatedAt: reservation.updatedAt,
                };
            }));

            callback(null, results);
        } catch (error) {
            callback(error);
        }
    });
};

module.exports = {
    createReservation,
    cancelReservation,
    changeSeat,
    getReservationsByExternalUserId,
    getFullReservationsByExternalUserId
};


module.exports = {
    createReservation,
    cancelReservation,
    changeSeat,
    getReservationsByExternalUserId,
    getFullReservationsByExternalUserId
};
