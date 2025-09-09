const db = require('../config/db');

// Reservar un asiento disponible de un vuelo específico
const reservarAsiento = (idVuelo, idAsiento, callback) => {
    // Solo permite reservar si el asiento está disponible
    const query = `UPDATE asiento SET Estado = 'reservado' WHERE Id_vuelo = ? AND Id_asiento = ? AND Estado = 'disponible'`;
    db.query(query, [idVuelo, idAsiento], (err, result) => {
        if (err) return callback(err);
        // Si no se actualizó ninguna fila, el asiento no estaba disponible
        if (result.affectedRows === 0) {
            return callback(null, { success: false, message: 'El asiento no está disponible o no existe.' });
        }
        callback(null, { success: true, message: 'Asiento reservado correctamente.' });
    });
};

module.exports = {
    reservarAsiento
};
