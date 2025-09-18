const db = require('../config/db');

// Obtiene los asientos reservados o confirmados junto con externalFlightId y aircraft
const getReservedOrConfirmedSeats = (externalFlightId, callback) => {
    // Primero obtenemos la información del vuelo SIEMPRE
    const flightQuery = `
        SELECT externalFlightId, aircraft
        FROM flights
        WHERE externalFlightId = ?
    `;
    
    db.query(flightQuery, [externalFlightId], (err, flightResults) => {
        if (err) return callback(err);
        
        if (flightResults.length === 0) {
            return callback(null, {
                flightId: null,
                airCraftType: null,
                occupiedSeats: [],
                reservedSeats: [],
                error: 'Flight not found'
            });
        }
        
        const flight = flightResults[0];
        
        // Luego obtenemos los asientos ocupados/reservados (si existen)
        const seatsQuery = `
            SELECT seatId, status
            FROM seats
            WHERE status IN ('RESERVED', 'CONFIRMED')
            AND externalFlightId = ?
        `;
        
        db.query(seatsQuery, [externalFlightId], (err, seatsResults) => {
            if (err) return callback(err);
            
            // Agrupar resultados
            const occupiedSeats = [];
            const reservedSeats = [];
            
            seatsResults.forEach(row => {
                if (row.status === 'CONFIRMED') occupiedSeats.push(row.seatId);
                if (row.status === 'RESERVED') reservedSeats.push(row.seatId);
            });
            
            // Siempre devolver la información del vuelo
            callback(null, {
                flightId: flight.externalFlightId,
                airCraftType: flight.aircraft,
                occupiedSeats,
                reservedSeats
            });
        });
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
    const query = `UPDATE seats SET status = 'AVAILABLE' WHERE externalFlightId = ? AND seatId = ? AND status = 'RESERVED'`;
    db.query(query, [externalFlightId, seatId], (err, result) => {
        if (err) return callback(err);
        if (result.affectedRows === 0) {
            return callback(null, { success: false, message: 'Seat not found or not reserved.' });
        }
        callback(null, { success: true, message: 'Seat released due to timeout or payment failure.' });
    });
};

module.exports = {
    getReservedOrConfirmedSeats,
    reserveSeat,
    cancelSeat,
    timeoutOrPaymentFailure
};


