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
                flightData.date,
                flightData.duration,
                flightData.freeSeats || 0,
                0 // occupiedSeats lo manejamos nosotros, siempre inicia en 0
            ],
            callback
        );
    });
};

module.exports = { insertFlight };