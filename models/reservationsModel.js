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
                        WHERE seatId IN (${seatIds.map(() => '?').join(',')}) AND externalFlightId = ?
                    `;
                    const seatResult = await db.promise().query(seatSql, [...seatIds, reservation.externalFlightId]);
                    seats = seatResult[0];
                }

                let origin = {};
                let destination = {};
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



const createReservation = (externalUserId, externalFlightId, seatIds, currency, callback) => {
    if (!externalFlightId) {
        return callback({ success: false, message: 'externalFlightId is required.' });
    }
    if (!Array.isArray(seatIds) || seatIds.length === 0) {
        return callback({ success: false, message: 'seatIds must be a non-empty array.' });
    }

    // ✅ VALIDACIÓN 1: Verificar que el vuelo exista y NO esté cancelado
    const checkFlightQuery = `SELECT flightStatus FROM flights WHERE externalFlightId = ?`;
    db.query(checkFlightQuery, [externalFlightId], (errFlight, flightRows) => {
        if (errFlight) return callback(errFlight);

        if (!flightRows || flightRows.length === 0) {
            console.error(`[createReservation] ❌ Flight not found: ${externalFlightId}`);
            return callback(null, { 
                success: false, 
                message: 'Flight not found.' 
            });
        }

        const flightStatus = flightRows[0].flightStatus;

        if (flightStatus === 'CANCELLED') {
            console.error(`[createReservation] ❌ Cannot create reservation on cancelled flight: ${externalFlightId}`);
            return callback(null, { 
                success: false, 
                message: 'Cannot create reservation on a cancelled flight.' 
            });
        }

        console.log(`[createReservation] ✅ Flight status validated: ${flightStatus}`);

        // Continuar con la creación de la reserva
        proceedWithReservation();
    }); // ✅ Cierre del db.query(checkFlightQuery)

    function proceedWithReservation() {
        const placeholders = seatIds.map(() => '?').join(',');
        const seatsCount = seatIds.length;

        // Verificar que no estén ocupados
        const checkQuery = `
            SELECT seatId, status FROM seats 
            WHERE seatId IN (${placeholders}) AND externalFlightId = ? 
            AND (status = 'RESERVED' OR status = 'CONFIRMED')
        `;
        db.query(checkQuery, [...seatIds, externalFlightId], (err, rows) => {
            if (err) return callback(err);
            if (rows.length > 0) {
                return callback(null, { 
                    success: false, 
                    message: 'One or more seats are already taken.', 
                    takenSeats: rows.map(r => r.seatId) 
                });
            }

            // Verificar que todos estén disponibles
            const availableQuery = `
                SELECT seatId, price FROM seats 
                WHERE seatId IN (${placeholders}) AND externalFlightId = ? AND status = 'AVAILABLE'
            `;
            db.query(availableQuery, [...seatIds, externalFlightId], (err2, availableRows) => {
                if (err2) return callback(err2);
                const availableSeatIds = availableRows.map(r => r.seatId);
                if (availableSeatIds.length !== seatIds.length) {
                    const notAvailable = seatIds.filter(id => !availableSeatIds.includes(id));
                    return callback(null, { 
                        success: false, 
                        message: `Seat(s) ${notAvailable.join(', ')} are not available or do not exist.` 
                    });
                }

                // Calcular precio total
                const totalPrice = availableRows.reduce((sum, seat) => sum + Number(seat.price), 0);

                let completed = 0;
                let hasError = false;
                let reservationId = null;
                const status = 'PENDING';
                const seatIdJson = JSON.stringify(seatIds);

                // Crear la reserva
                const insertQuery = `
                    INSERT INTO reservations (externalUserId, externalFlightId, seatId, status, totalPrice, currency)
                    VALUES (?, ?, ?, ?, ?, ?)
                `;
                db.query(insertQuery, [externalUserId, externalFlightId, seatIdJson, status, totalPrice, 'ARS'], (err3, result) => {
                    if (err3) return callback(err3);

                    reservationId = result.insertId;

                    // Reservar cada asiento
                    seatIds.forEach((seatId) => {
                        const reserveQuery = `
                            UPDATE seats SET status = 'RESERVED' 
                            WHERE seatId = ? AND externalFlightId = ? AND status = 'AVAILABLE'
                        `;
                        db.query(reserveQuery, [seatId, externalFlightId], (err4, reserveResult) => {
                            if (hasError) return;
                            if (err4 || reserveResult.affectedRows === 0) {
                                hasError = true;
                                const deleteQuery = `DELETE FROM reservations WHERE reservationId = ?`;
                                db.query(deleteQuery, [reservationId], () => {
                                    return callback(null, { 
                                        success: false, 
                                        message: `Seat ${seatId} could not be reserved.` 
                                    });
                                });
                                return;
                            }

                            completed++;
                            if (completed === seatIds.length && !hasError) {
                                // ✅ ACTUALIZAR CONTADORES EN FLIGHTS
                                const updateFlightQuery = `
                                    UPDATE flights 
                                    SET freeSeats = freeSeats - ?, occupiedSeats = occupiedSeats + ?
                                    WHERE externalFlightId = ?
                                `;
                                db.query(updateFlightQuery, [seatsCount, seatsCount, externalFlightId], (err5) => {
                                    if (err5) {
                                        console.error('Error updating flight counters:', err5);
                                        // Continuar aunque falle el contador
                                    }

                                    // Consultar aircraftModel
                                    const getFlightQuery = `SELECT aircraftModel FROM flights WHERE externalFlightId = ?`;
                                    db.query(getFlightQuery, [externalFlightId], (err6, flightRows2) => {
                                        if (err6) {
                                            console.error('Error fetching aircraftModel:', err6);
                                        }

                                        const aircraftModel = flightRows2 && flightRows2.length > 0 
                                            ? flightRows2[0].aircraftModel 
                                            : null;

                                        // Crear evento de pago
                                        const eventoQuery = `
                                            INSERT INTO paymentEvents (reservationId, externalUserId, paymentStatus, amount)
                                            VALUES (?, ?, 'PENDING', ?)
                                        `;
                                        db.query(eventoQuery, [reservationId, externalUserId, totalPrice], (err7) => {
                                            if (err7) return callback(err7);
                                            callback(null, { 
                                                success: true, 
                                                message: 'All seats reserved successfully.', 
                                                reservationId, 
                                                totalPrice,
                                                seatsReserved: seatsCount,
                                                currency: 'ARS',
                                                aircraftModel
                                            });
                                        });
                                    });
                                });
                            }
                        });
                    });
                });
            });
        });
    } // ✅ cierre de proceedWithReservation
}; // ✅ cierre de createReservation


const cancelReservation = (reservationId, callback) => {
    const findReservationQuery = `SELECT * FROM reservations WHERE reservationId = ?`;
    db.query(findReservationQuery, [reservationId], (err, reservationRows) => {
        if (err) return callback(err);
        if (!reservationRows[0]) {
            return callback(null, { success: false, message: 'Reservation does not exist.' });
        }
        const reservation = reservationRows[0];
        
        // Si ya está en PENDING_REFUND, no hacer nada (idempotente)
        if (reservation.status === 'PENDING_REFUND') {
            // Obtener fecha del vuelo para el evento
            const getFlightDateQuery = `SELECT flightDate FROM flights WHERE flightId = ?`;
            db.query(getFlightDateQuery, [reservation.flightId], (err4, flightRows) => {
                const flightDate = (flightRows && flightRows[0] && flightRows[0].flightDate) 
                    ? flightRows[0].flightDate 
                    : reservation.createdAt;
                
                return callback(null, { 
                    success: true, 
                    message: 'Reservation is already in PENDING_REFUND status.',
                    alreadyCancelled: true,
                    reservationDate: reservation.createdAt,
                    flightDate: flightDate
                });
            });
            return;
        }
        
        // Solo permitir cancelar reservas en PAID
        if (reservation.status !== 'PAID') {
            return callback(null, { success: false, message: 'Only PAID reservations can be cancelled.' });
        }

        // Contar asientos de la reserva (solo para información)
        let seatIds = [];
        try {
            seatIds = Array.isArray(reservation.seatId) ? reservation.seatId : JSON.parse(reservation.seatId);
        } catch {
            seatIds = [reservation.seatId];
        }
        const seatsCount = seatIds.length;

    // Actualizar estado de la reserva (si ya está en PENDING_REFUND, mantenerlo)
    const newStatus = reservation.status === 'PENDING_REFUND' ? 'PENDING_REFUND' : 'PENDING_REFUND';
    const cancelQuery = `UPDATE reservations SET status = ? WHERE reservationId = ?`;
    db.query(cancelQuery, [newStatus, reservationId], (err2) => {
            if (err2) return callback(err2);

            // Crear evento PENDING_REFUND
            const pendingEventQuery = `
                INSERT INTO paymentEvents (reservationId, externalUserId, paymentStatus, amount)
                VALUES (?, ?, 'PENDING_REFUND', ?)
            `;
            db.query(pendingEventQuery, [reservationId, reservation.externalUserId, reservation.totalPrice], (err3) => {
                if (err3) return callback(err3);
                
                // Obtener fecha del vuelo para el evento (si no existe, usar la fecha de reserva)
                const getFlightDateQuery = `SELECT flightDate FROM flights WHERE flightId = ?`;
                db.query(getFlightDateQuery, [reservation.flightId], (err4, flightRows) => {
                    // Si hay error o no hay filas, usar la fecha de creación de la reserva como fallback
                    const flightDate = (flightRows && flightRows[0] && flightRows[0].flightDate) 
                        ? flightRows[0].flightDate 
                        : reservation.createdAt;
                    
                    callback(null, { 
                        success: true, 
                        message: 'Reservation cancelled and refund pending.',
                        seatsCancelled: seatsCount,
                        note: 'Seats remain reserved, counters unchanged',
                        reservationDate: reservation.createdAt,
                        flightDate: flightDate
                    });
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
                        WHERE seatId IN (${seatIds.map(() => '?').join(',')}) AND externalFlightId = ?
                    `;
                    const seatResult = await db.promise().query(seatSql, [...seatIds, reservation.externalFlightId]);
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
    getFullReservationsByExternalUserId,
}
// El método ya valida correctamente la disponibilidad de los asientos.
// Si el asiento no existe o no está AVAILABLE para ese vuelo, la reserva será rechazada
